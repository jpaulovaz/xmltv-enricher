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

// Tenta carregar a config de placeholders.
let placeholdersConfig = { styles: {}, channels: {} };
try {
  placeholdersConfig = require('../config/placeholders.json');
} catch (e) {
  logger.warn("Arquivo src/config/placeholders.json não encontrado. Usando fallback padrão.");
}

class MatchingService {
  constructor(...args) {
    // CORRECAO: Verificar o TIPO do ultimo argumento, nao a quantidade
    // Esperado: [...apis, config, cacheService, manualOverrideService]
    const lastArg = args[args.length - 1];
    
    // Verificar se o ultimo argumento eh ManualOverrideService
    // (tem metodo 'get' e 'add', nao eh null)
    const isManualOverrideService = lastArg !== null && typeof lastArg === 'object' && 
                                    (typeof lastArg.get === 'function' || typeof lastArg.add === 'function');
    
    this.manualOverrideService = isManualOverrideService ? lastArg : null;
    
    // SEMPRE ha manualOverrideService (pode ser null), entao:
    // [...apis, config, cacheService, manualOverrideService]
    // config = args[-3], cacheService = args[-2], manualOverrideService = args[-1]
    const configIndex = args.length - 3;
    const cacheServiceIndex = args.length - 2;
    
    this.cacheService = args[cacheServiceIndex];
    const configArg = args[configIndex];
    
    // Validar que configArg foi extraido corretamente
    if (!configArg || !configArg.matching) {
      throw new Error('MatchingService: config nao foi passado corretamente. Verifique a ordem dos argumentos no constructor.');
    }
    
    // APIs sao todos os argumentos antes de config
    // [...apis, config, cacheService, manualOverrideService]
    // APIs terminam em args.length - 3
    const apisEndIndex = -3;
    this.apis = args.slice(0, apisEndIndex).filter(api => api !== null);

    this.fuzzyMatcher = new FuzzyMatcher(
      configArg.matching.algorithm,
      configArg.matching.confidenceThreshold
    );
    this.threshold = configArg.matching.confidenceThreshold;

    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.auditFilePath = path.join(dataDir, 'auditoria_enricher.csv');

    // Sobrescreve o arquivo com o cabeçalho (limpando o conteúdo anterior)
    fs.writeFileSync(this.auditFilePath, "\ufeffCanal;Título Original;Busca;Status;Confiança;Resultado API;Fonte\n", 'utf-8');
    logger.info(`MatchingService inicializado.`);
  }

  _getDynamicPlaceholder(channelName, defaultPlaceholder) {
    if (!channelName || channelName === '-') return defaultPlaceholder;
    const style = placeholdersConfig.channels[channelName];
    if (style && placeholdersConfig.styles[style]) {
      return placeholdersConfig.styles[style];
    }
    if (placeholdersConfig.styles.generic) {
      return placeholdersConfig.styles.generic;
    }
    return defaultPlaceholder;
  }

  async enrichProgram(programme, placeholderImageUrl, channelName = '-') {
    const originalTitle = programme.title?.[0] || 'Unknown';
    const yearFromTitle = extractYearFromTitle(originalTitle);
    const cleanTitle = extractCleanTitle(cleanSeriesInfo(originalTitle));
    const activePlaceholder = this._getDynamicPlaceholder(channelName, placeholderImageUrl);

    // --- BLOCO DE OVERRIDE (CORRIGIDO) ---
    if (this.manualOverrideService) {
      // Gerar múltiplas variações do título para buscar override
      const titleVariations = [
        cleanTitle,
        originalTitle,
        cleanSeriesInfo(originalTitle),
        originalTitle.split(/[-–]/)[0].trim(),
        cleanTitle.split(/[-–]/)[0].trim()
      ].filter((v, i, a) => v && a.indexOf(v) === i);

      let override = null;
      let overrideKey = null;

      for (const titleVar of titleVariations) {
        override = this.manualOverrideService.get(titleVar);
        if (override) {
          overrideKey = titleVar;
          break;
        }
      }

      if (override && override.tmdbId) {
        logger.info(`⚡ Override Manual identificado: "${originalTitle}" (chave: "${overrideKey}") -> TMDb ID ${override.tmdbId}`);
        const tmdbApi = this.apis.find(api => api.constructor.name === 'TMDbAPI');
        if (tmdbApi && typeof tmdbApi.enrichById === 'function') {
          try {
            const enriched = await tmdbApi.enrichById(override.tmdbId, override.type);
            if (enriched && enriched.title) {
              logger.info(`✅ Dados do override obtidos com sucesso: ${enriched.title}`);
              this._writeToAudit(channelName, originalTitle, `ID: ${override.tmdbId}`, 100, enriched.title, 'Manual Override');
              const result = this._applyEnrichment(programme, enriched, activePlaceholder);
              result._enrichmentSource = 'manual_override';
              result._wasEnriched = true;
              return result;
            } else {
              logger.warn(`⚠️ enrichById retornou dados inválidos para TMDb ID ${override.tmdbId}`);
              this._writeToAudit(channelName, originalTitle, `ID: ${override.tmdbId}`, 0, 'OVERRIDE INVÁLIDO', 'Manual Override');
            }
          } catch (error) {
            logger.error(`❌ Erro ao buscar dados do override (ID ${override.tmdbId}): ${error.message}`);
            this._writeToAudit(channelName, originalTitle, `ID: ${override.tmdbId}`, 0, `ERRO: ${error.message}`, 'Manual Override');
          }
        } else {
          logger.warn(`⚠️ TMDb API não disponível para processar override`);
        }
      }
    } // <-- CHAVE FECHADA AQUI PARA NÃO PRENDER O RESTO DO CÓDIGO

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
            const enrichedProg = this._applyEnrichment(programme, cached, activePlaceholder);
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
    let matchViaAlias = false;
    let aliasUsed = '';

    for (const titleToTry of titlesToTry) {
      if (titlesToSkipApi.has(titleToTry)) continue;
      for (const api of this.apis) {
        try {
          if (api.initialize) await api.initialize();
          if (api.constructor.name === 'TVDbAPI') await api.authenticate();
          const yearsToTry = yearFromTitle ? [yearFromTitle, null] : [null];
          for (const yearAttempt of yearsToTry) {
            const enriched = await api.enrichProgram(titleToTry, yearAttempt);
            if (enriched) {
              let score = this.fuzzyMatcher.calculateSimilarity(titleToTry, enriched.title || titleToTry);
              let currentMatchViaAlias = false;
              let currentAliasUsed = '';
              if (score < this.threshold && enriched.original_title) {
                const originalScore = this.fuzzyMatcher.calculateSimilarity(titleToTry, enriched.original_title);
                if (originalScore > score) {
                  score = originalScore;
                  currentMatchViaAlias = true;
                  currentAliasUsed = enriched.original_title;
                }
              }
              if (score < this.threshold && enriched.alternative_titles?.titles) {
                for (const alias of enriched.alternative_titles.titles) {
                  const aliasScore = this.fuzzyMatcher.calculateSimilarity(titleToTry, alias.title);
                  if (aliasScore > score) {
                    score = aliasScore;
                    currentMatchViaAlias = true;
                    currentAliasUsed = alias.title;
                  }
                }
              }
              if (score < this.threshold && score > 40 && !yearAttempt) score += 20;
              if (score > bestScore) {
                bestScore = score;
                bestEnriched = enriched;
                usedTitle = titleToTry;
                finalSource = enriched.source;
                matchViaAlias = currentMatchViaAlias;
                aliasUsed = currentAliasUsed;
              }
              if (bestScore >= 95) break;
            }
          }
        } catch (e) { }
        if (bestScore >= 95) break;
      }
      if (bestScore >= 95) break;
    }

    if (bestEnriched && bestScore >= this.threshold) {
      const aliasSuffix = matchViaAlias ? ` (Match via Alias: ${aliasUsed})` : '';
      logger.info(`✓ Enriquecido via ${finalSource}: "${usedTitle}" (${bestScore}%)${aliasSuffix}`);
      this.cacheService.set(usedTitle, yearFromTitle, bestEnriched);
      this._writeToAudit(channelName, originalTitle, usedTitle, bestScore, bestEnriched.title, finalSource, aliasSuffix);
      const enrichedProg = this._applyEnrichment(programme, bestEnriched, activePlaceholder);
      enrichedProg._enrichmentSource = finalSource;
      enrichedProg._wasEnriched = true;
      return enrichedProg;
    }

    logger.warn(`✗ Nenhuma API retornou dados com confiança >= ${this.threshold}% para: "${cleanTitle}"`);
    if (bestScore > 0) {
      try { if (cleanTitle) this.cacheService.set(cleanTitle, yearFromTitle, { notFound: true }); } catch (e) { }
      this._writeToAudit(channelName, originalTitle, usedTitle !== '-' ? usedTitle : cleanTitle, bestScore, bestEnriched ? bestEnriched.title : "REJEITADO", finalSource);
    } else {
      try { if (cleanTitle) this.cacheService.set(cleanTitle, yearFromTitle, { notFound: true }); } catch (e) { }
      this._writeToAudit(channelName, originalTitle, cleanTitle, 0, 'NADA ENCONTRADO', '-');
    }

    const placeholderProg = this._applySmartPlaceholder(programme, activePlaceholder);
    placeholderProg._enrichmentSource = 'placeholder';
    placeholderProg._wasEnriched = false;
    return placeholderProg;
  }

  _writeToAudit(channel, original, search, confidence, resultTitle, source, aliasSuffix = '') {
    const numericScore = (typeof confidence === 'string' ? parseFloat(confidence) : confidence);
    const isSuccess = numericScore >= this.threshold || numericScore === 100;
    let status = isSuccess ? (aliasSuffix ? '✅ Correspondência Por Alias' : '✅ Correspondência Encontrada') : (numericScore > 0 ? '⚠️ Baixa Confiança - Rejeitado' : '❌ Não Encontrado');
    const safeOriginal = original ? original.replace(/;/g, ',') : '';
    const safeSearch = search ? search.replace(/;/g, ',') : '';
    const safeResult = resultTitle ? resultTitle.replace(/;/g, ',') : '-';
    const finalResultDisplay = aliasSuffix ? `${safeResult}${aliasSuffix}` : safeResult;
    const line = `"${channel}";"${safeOriginal}";"${safeSearch}";${status};${confidence}%;"${finalResultDisplay}";${source}\n`;
    try {
      fs.appendFileSync(this.auditFilePath, line, 'utf-8');
    } catch (e) {
      logger.error(`Erro ao escrever auditoria: ${e.message}`);
    }
  }

  closeAuditStream() { }
  saveAuditCSV() { }

  _applyEnrichment(programme, data, placeholder) {
    const prog = { ...programme };
    const lang = config.api.language || 'pt-BR';
    prog.icon = [{ $: { src: data.image || placeholder } }];


    if (data.description && data.description.length > 10) {
      prog.desc = [data.description];
    }

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
    prog.icon = [{ $: { src: dynamicPlaceholder } }];
    return prog;
  }
}

module.exports = MatchingService;