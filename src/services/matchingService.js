const logger = require('../utils/logger');
const config = require('../config');
const {
  extractCleanTitle,
  cleanSeriesInfo,
  extractYearFromTitle,
  parseEpisodeInfo,
  convertToXmltvNs
} = require('../utils/helpers');
const FuzzyMatcher = require('../utils/fuzzyMatcher');
const fs = require('fs');
const path = require('path');

// Tenta carregar a config de placeholders. Se falhar, usa objeto vazio para não quebrar.
let placeholdersConfig = { styles: {}, channels: {} };
try {
  placeholdersConfig = require('../config/placeholders.json');
} catch (e) {
  logger.warn("Arquivo src/config/placeholders.json não encontrado. Usando fallback padrão.");
}

class MatchingService {
  constructor(...args) {
    this.cacheService = args[args.length - 1];
    const configArg = args[args.length - 2];
    this.apis = args.slice(0, -2).filter(api => api !== null);

    this.fuzzyMatcher = new FuzzyMatcher(
      configArg.matching.algorithm,
      configArg.matching.confidenceThreshold
    );
    this.threshold = configArg.matching.confidenceThreshold;

    // Usar o diretório data que já é mapeado no Docker
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.auditFilePath = path.join(dataDir, 'auditoria_enricher.csv');
    // Sempre recriar o arquivo de auditoria no início de cada execução
    fs.writeFileSync(this.auditFilePath, "\ufeffCanal;Título Original;Busca;Status;Confiança;Resultado API;Fonte\n", 'utf-8');
    logger.info(`Arquivo de auditoria criado: ${this.auditFilePath}`);
  }

  // Helper para decidir qual imagem usar baseada no canal
  _getDynamicPlaceholder(channelName, defaultPlaceholder) {
    if (!channelName || channelName === '-') return defaultPlaceholder;

    // 1. Verifica se o canal tem um estilo definido
    const style = placeholdersConfig.channels[channelName];

    // 2. Se tiver estilo e o estilo tiver uma URL, retorna ela
    if (style && placeholdersConfig.styles[style]) {
      return placeholdersConfig.styles[style];
    }

    // 3. Se não, tenta usar o estilo 'generic' do JSON
    if (placeholdersConfig.styles.generic) {
      return placeholdersConfig.styles.generic;
    }

    // 4. Último caso: usa o que veio do .env
    return defaultPlaceholder;
  }

  async enrichProgram(programme, placeholderImageUrl, channelName = '-') {
    const originalTitle = programme.title?.[0] || 'Unknown';
    const yearFromTitle = extractYearFromTitle(originalTitle);
    const cleanTitle = extractCleanTitle(originalTitle);

    // --- CÁLCULO DO PLACEHOLDER DINÂMICO ---
    // Define qual imagem será usada caso nada seja encontrado ou a API não tenha poster.
    const activePlaceholder = this._getDynamicPlaceholder(channelName, placeholderImageUrl);

    // --- ESTRATÉGIA DE NOMES ---
    const splitRegexHyphen = /(\s+[-–]\s+|\s*\()/;
    const splitRegexColon = /\s*:\s*/;

    const titlesToTry = [
      cleanTitle,
      cleanSeriesInfo(cleanTitle),
      cleanTitle.split(splitRegexHyphen)[0].trim(),
      cleanTitle.split(splitRegexColon)[0].trim()
    ].filter((v, i, a) => v && v.length > 1 && a.indexOf(v) === i);

    const titlesToSkipApi = new Set();

    // FASE 1: CACHE
    for (const title of titlesToTry) {
      try {
        const cached = await this.cacheService.get(title, yearFromTitle);
        if (cached) {
          if (!cached.notFound) {
            logger.info(`✓ Encontrado em cache: "${title}"`);
            this._writeToAudit(channelName, originalTitle, title, 100, cached.title, 'Cache');
            // Passa o activePlaceholder para usar se o cache não tiver imagem
            const enrichedProg = this._applyEnrichment(programme, cached, activePlaceholder);
            // Marcar como cache hit e enriquecido
            enrichedProg._enrichmentSource = 'cache';
            enrichedProg._wasEnriched = true;
            return enrichedProg;
          } else {
            titlesToSkipApi.add(title);
          }
        }
      } catch (e) { }
    }

    // FASE 2: APIS
    let bestEnriched = null;
    let bestScore = 0;
    let usedTitle = '-';
    let finalSource = '-';

    for (const titleToTry of titlesToTry) {
      if (titlesToSkipApi.has(titleToTry)) continue;
      let foundForThisTitle = false;

      for (const api of this.apis) {
        try {
          if (api.initialize) await api.initialize();
          if (api.constructor.name === 'TVDbAPI') await api.authenticate();

          const yearsToTry = yearFromTitle ? [yearFromTitle, null] : [null];

          for (const yearAttempt of yearsToTry) {
            const enriched = await api.enrichProgram(titleToTry, yearAttempt);
            if (enriched) {
              let score = this.fuzzyMatcher.calculateSimilarity(titleToTry, enriched.title || titleToTry);
              if (score < this.threshold && score > 40 && !yearAttempt) score += 20;

              if (score > bestScore) {
                bestScore = score;
                bestEnriched = enriched;
                usedTitle = titleToTry;
                finalSource = enriched.source;
              }
              if (bestScore >= 95) break;
            }
          }
        } catch (e) { }
        if (bestScore >= 95) break;
      }
      if (bestScore >= 95) break;
    }

    // FASE 3: DECISÃO FINAL
    if (bestEnriched && bestScore >= this.threshold) {
      logger.info(`✓ Enriquecido via ${finalSource}: "${usedTitle}" (confiança: ${bestScore}%)`);
      this.cacheService.set(usedTitle, yearFromTitle, bestEnriched);
      this._writeToAudit(channelName, originalTitle, usedTitle, bestScore, bestEnriched.title, finalSource);
      const enrichedProg = this._applyEnrichment(programme, bestEnriched, activePlaceholder);
      // Marcar como enriquecido via API
      enrichedProg._enrichmentSource = finalSource;
      enrichedProg._wasEnriched = true;
      return enrichedProg;
    }

    const statusMsg = titlesToSkipApi.size > 0 ? " (Cache Negativo)" : "";
    logger.warn(`✗ Nenhuma API retornou dados com confiança >= ${this.threshold}% para: "${cleanTitle}"${statusMsg}`);

    if (bestScore > 0) {
      try { if (cleanTitle) this.cacheService.set(cleanTitle, yearFromTitle, { notFound: true }); } catch (e) { }
      const tentativaTitulo = bestEnriched ? bestEnriched.title : "Tentativa Falha";
      const fonteTentativa = finalSource !== '-' ? finalSource : 'Desconhecida';
      this._writeToAudit(channelName, originalTitle, usedTitle !== '-' ? usedTitle : cleanTitle, bestScore, tentativaTitulo, fonteTentativa);
    } else {
      try { if (cleanTitle) this.cacheService.set(cleanTitle, yearFromTitle, { notFound: true }); } catch (e) { }
      this._writeToAudit(channelName, originalTitle, cleanTitle, 0, 'NADA ENCONTRADO', '-');
    }

    // Retorna o Placeholder Dinâmico
    const placeholderProg = this._applySmartPlaceholder(programme, activePlaceholder);
    // Marcar como NÃO enriquecido (usou placeholder)
    placeholderProg._enrichmentSource = 'placeholder';
    placeholderProg._wasEnriched = false;
    return placeholderProg;
  }

  _writeToAudit(channel, original, search, confidence, resultTitle, source) {
    const numericScore = (typeof confidence === 'string' ? parseFloat(confidence) : confidence);
    const isSuccess = numericScore >= this.threshold || numericScore === 100;

    let status = '❌ NADA';
    if (isSuccess) status = '✅ OK';
    else if (numericScore > 0) status = '⚠️ REJEITADO';

    const safeOriginal = original ? original.replace(/;/g, ',') : '';
    const safeSearch = search ? search.replace(/;/g, ',') : '';
    const safeResult = resultTitle ? resultTitle.replace(/;/g, ',') : '-';

    const line = `"${channel}";"${safeOriginal}";"${safeSearch}";${status};${confidence}%;"${safeResult}";${source}\n`;

    // Escrever diretamente no arquivo para garantir persistência
    try {
      fs.appendFileSync(this.auditFilePath, line, 'utf-8');
    } catch (e) {
      logger.error(`Erro ao escrever auditoria: ${e.message}`);
    }
  }

  // Método para fechar recursos (mantido para compatibilidade)
  closeAuditStream() {
    // Não há mais stream para fechar, usando appendFileSync
  }

  saveAuditCSV() { }

  _applyEnrichment(programme, data, placeholder) {
    const prog = { ...programme };
    const lang = config.api.language || 'pt-BR';
    // Usa a imagem da API ou o placeholder dinâmico
    prog.icon = [{ $: { src: data.image || placeholder } }];
    if (data.genres) prog.category = data.genres.map(g => ({ _: g, $: { lang: lang } }));
    if (data.year) prog.date = [data.year.toString()];
    if (data.rating) prog.rating = [{ value: [data.rating], $: { system: 'BR' } }];

    const epInfo = parseEpisodeInfo(programme.title?.[0]);
    if (epInfo) {
      prog['episode-num'] = [{ _: convertToXmltvNs(epInfo.season, epInfo.episode), $: { system: 'xmltv_ns' } }];
    }
    return prog;
  }

  _applySmartPlaceholder(programme, dynamicPlaceholder) {
    const prog = { ...programme };
    const originalTitle = programme.title?.[0] || 'Unknown';
    const epInfo = parseEpisodeInfo(originalTitle);

    if (epInfo) {
      prog['episode-num'] = [{ _: convertToXmltvNs(epInfo.season, epInfo.episode), $: { system: 'xmltv_ns' } }];
    }
    // Aplica a imagem temática (Kids, Sports, etc) em vez da genérica
    prog.icon = [{ $: { src: dynamicPlaceholder } }];
    return prog;
  }
}

module.exports = MatchingService;