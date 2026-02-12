const logger = require('../utils/logger');
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

class MatchingService {
  constructor(...args) {
    this.cacheService = args[args.length - 1];
    const config = args[args.length - 2];
    this.apis = args.slice(0, -2).filter(api => api !== null);

    this.fuzzyMatcher = new FuzzyMatcher(
      config.matching.algorithm,
      config.matching.confidenceThreshold
    );
    this.threshold = config.matching.confidenceThreshold;

    this.auditFilePath = path.join(process.cwd(), 'auditoria_enricher.csv');
    // Verifica se o arquivo existe, senão cria com cabeçalho
    if (!fs.existsSync(this.auditFilePath)) {
      fs.writeFileSync(this.auditFilePath, "\ufeffCanal;Título Original;Busca;Status;Confiança;Resultado API;Fonte\n", 'utf-8');
    }
    this.auditStream = fs.createWriteStream(this.auditFilePath, { flags: 'a', encoding: 'utf-8' });
  }

  // Método principal de enriquecimento
  async enrichProgram(programme, placeholderImageUrl, channelName = '-') {
    const originalTitle = programme.title?.[0] || 'Unknown';
    const yearFromTitle = extractYearFromTitle(originalTitle);
    const cleanTitle = extractCleanTitle(originalTitle);

    // --- MUDANÇA 1: Estratégia de Criação de Títulos ---

    // Regex para proteger hífen (Homem-Aranha) mas permitir quebra em parênteses
    const splitRegexHyphen = /(\s+[-–]\s+|\s*\()/;

    // NOVO: Regex específico para quebrar em DOIS PONTOS (Resolve Chicago Fire: Ambição)
    const splitRegexColon = /\s*:\s*/;

    const titlesToTry = [
      cleanTitle, // Tenta: "Chicago Fire: Ambição" (Falha)
      cleanSeriesInfo(cleanTitle), // Tenta: "Chicago Fire: Ambição" (Falha)
      cleanTitle.split(splitRegexHyphen)[0].trim(), // Tenta quebra de hífen
      // AQUI ESTÁ A MÁGICA PARA AS SÉRIES:
      cleanTitle.split(splitRegexColon)[0].trim() // Tenta: "Chicago Fire" (SUCESSO!)
    ].filter((v, i, a) => v && v.length > 1 && a.indexOf(v) === i);

    const titlesToSkipApi = new Set();

    // FASE 1: CACHE
    for (const title of titlesToTry) {
      try {
        const cached = await this.cacheService.get(title, yearFromTitle);
        if (cached) {
          if (!cached.notFound) {
            logger.info(`✓ Encontrado em cache: "${title}"`);
            // Passa o canal para o log
            this._writeToAudit(channelName, originalTitle, title, 100, cached.title, 'Cache');
            return this._applyEnrichment(programme, cached, placeholderImageUrl);
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

              if (score >= this.threshold && score > bestScore) {
                bestScore = score;
                bestEnriched = enriched;
                usedTitle = titleToTry;
                finalSource = enriched.source;
                foundForThisTitle = true;
                if (bestScore >= 95) break;
              }
            }
          }
        } catch (e) { }
        if (bestScore >= 95) break;
      }

      if (!foundForThisTitle && !bestEnriched) {
        try { this.cacheService.set(titleToTry, yearFromTitle, { notFound: true }); } catch (e) { }
      }
      if (bestScore >= 95) break;
    }

    // --- MUDANÇA 2: Lógica de Gravação na Auditoria ---

    if (bestEnriched) {
      // SUCESSO: Gravamos o vencedor
      logger.info(`✓ Enriquecido via ${finalSource}: "${usedTitle}" (confiança: ${bestScore}%)`);
      this.cacheService.set(usedTitle, yearFromTitle, bestEnriched);
      this._writeToAudit(channelName, originalTitle, usedTitle, bestScore, bestEnriched.title, finalSource);
      return this._applyEnrichment(programme, bestEnriched, placeholderImageUrl);
    }

    // FRACASSO: Mas agora vamos contar a história completa (REJEITADO vs NADA)
    const statusMsg = titlesToSkipApi.size > 0 ? " (Cache Negativo)" : "";
    logger.warn(`✗ Nenhuma API retornou dados com confiança >= ${this.threshold}% para: "${cleanTitle}"${statusMsg}`);

    // Se houve alguma tentativa com score > 0 (mesmo que baixo), gravamos como REJEITADO.
    if (bestScore > 0) {
      // Grava a melhor tentativa, mesmo que tenha falhado
      const tentativaTitulo = bestEnriched ? bestEnriched.title : "Tentativa Falha";
      const fonteTentativa = finalSource !== '-' ? finalSource : 'Desconhecida';
      this._writeToAudit(channelName, originalTitle, usedTitle !== '-' ? usedTitle : cleanTitle, bestScore, tentativaTitulo, fonteTentativa);
    } else {
      // Se score for 0, é NADA ENCONTRADO mesmo
      this._writeToAudit(channelName, originalTitle, cleanTitle, 0, 'NADA ENCONTRADO', '-');
    }

    return this._applySmartPlaceholder(programme, placeholderImageUrl);
  }

  // Grava a linha no CSV
  _writeToAudit(channel, original, search, confidence, resultTitle, source) {
    const numericScore = (typeof confidence === 'string' ? parseFloat(confidence) : confidence);

    // Define status: OK (Sucesso) ou REJEITADO (Falhou por pouco) ou NADA (Zero)
    const isSuccess = numericScore >= this.threshold || numericScore === 100;

    // Se passou, é OK. Se não passou mas tem score, é REJEITADO. Se score é 0, é NADA.
    let status = '❌ NADA';
    if (isSuccess) {
      status = '✅ OK';
    } else if (numericScore > 0) {
      status = '⚠️ REJEITADO';
    }

    // Formata a linha do CSV
    const line = `"${channel}";"${original.replace(/;/g, ',')}";"${search.replace(/;/g, ',')}";${status};${confidence}%;"${resultTitle ? resultTitle.replace(/;/g, ',') : '-'}";${source}\n`;
    this.auditStream.write(line);
  }

  saveAuditCSV() { }

  _applyEnrichment(programme, data, placeholder) {
    const prog = { ...programme };
    prog.icon = [{ $: { src: data.image || placeholder } }];
    if (data.genres) prog.category = data.genres.map(g => ({ _: g, $: { lang: 'pt-BR' } }));
    if (data.year) prog.date = [data.year.toString()];
    if (data.rating) prog.rating = [{ value: [data.rating], $: { system: 'BR' } }];

    const epInfo = parseEpisodeInfo(programme.title?.[0]);
    if (epInfo) {
      prog['episode-num'] = [{ _: convertToXmltvNs(epInfo.season, epInfo.episode), $: { system: 'xmltv_ns' } }];
    }

    return prog;
  }

  _applySmartPlaceholder(programme, staticPlaceholder) {
    const prog = { ...programme };
    const originalTitle = programme.title?.[0] || 'Unknown';

    const epInfo = parseEpisodeInfo(originalTitle);

    if (epInfo) {
      prog['episode-num'] = [{ _: convertToXmltvNs(epInfo.season, epInfo.episode), $: { system: 'xmltv_ns' } }];
    }

    prog.icon = [{ $: { src: staticPlaceholder } }];

    return prog;
  }
}

module.exports = MatchingService;