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
    // Verifica se existe, senão cria com cabeçalho
    if (!fs.existsSync(this.auditFilePath)) {
      fs.writeFileSync(this.auditFilePath, "\ufeffCanal;Título Original;Busca;Status;Confiança;Resultado API;Fonte\n", 'utf-8');
    }
    this.auditStream = fs.createWriteStream(this.auditFilePath, { flags: 'a', encoding: 'utf-8' });
  }

  async enrichProgram(programme, placeholderImageUrl, channelName = '-') {
    const originalTitle = programme.title?.[0] || 'Unknown';
    const yearFromTitle = extractYearFromTitle(originalTitle);
    const cleanTitle = extractCleanTitle(originalTitle);

    // --- ESTRATÉGIA DE NOMES (Mantendo as correções de hífen e dois pontos) ---
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

              // --- CORREÇÃO AQUI ---
              // Antes: if (score >= this.threshold && score > bestScore)
              // Agora: if (score > bestScore) -> Guarda o melhor mesmo se for ruim (para auditar depois)
              if (score > bestScore) {
                bestScore = score;
                bestEnriched = enriched;
                usedTitle = titleToTry;
                finalSource = enriched.source;
                // Não marcamos foundForThisTitle=true aqui ainda para não bloquear o cache negativo se for ruim
              }

              // Se achou um EXCELENTE, aí sim para tudo
              if (bestScore >= 95) break;
            }
          }
        } catch (e) { }
        if (bestScore >= 95) break;
      }

      // Se não achou NADA (nem ruim) ou achou algo muito ruim para este título específico, marcamos para não tentar de novo na mesma rodada
      if (!bestEnriched) {
        // Lógica simplificada: Cache negativo só é salvo no final se realmente falhar tudo
      }
      if (bestScore >= 95) break;
    }

    // FASE 3: DECISÃO FINAL (APROVAR OU REPROVAR)

    // CASO 1: SUCESSO (Atingiu o Threshold)
    if (bestEnriched && bestScore >= this.threshold) {
      logger.info(`✓ Enriquecido via ${finalSource}: "${usedTitle}" (confiança: ${bestScore}%)`);
      this.cacheService.set(usedTitle, yearFromTitle, bestEnriched);
      this._writeToAudit(channelName, originalTitle, usedTitle, bestScore, bestEnriched.title, finalSource);
      return this._applyEnrichment(programme, bestEnriched, placeholderImageUrl);
    }

    // CASO 2: FRACASSO (Mas temos dados para mostrar o "porquê")
    const statusMsg = titlesToSkipApi.size > 0 ? " (Cache Negativo)" : "";
    logger.warn(`✗ Nenhuma API retornou dados com confiança >= ${this.threshold}% para: "${cleanTitle}"${statusMsg}`);

    // Cache Negativo: Se tentamos e o melhor que conseguimos foi ruim, salvamos cache negativo para não gastar API na próxima
    // (Opcional: você pode comentar essa linha se quiser que ele continue tentando sempre os rejeitados)
    try {
      if (cleanTitle) this.cacheService.set(cleanTitle, yearFromTitle, { notFound: true });
    } catch (e) { }

    if (bestScore > 0) {
      // REJEITADO: Achou algo, mas a nota foi baixa
      const tentativaTitulo = bestEnriched ? bestEnriched.title : "Tentativa Falha";
      const fonteTentativa = finalSource !== '-' ? finalSource : 'Desconhecida';
      this._writeToAudit(channelName, originalTitle, usedTitle !== '-' ? usedTitle : cleanTitle, bestScore, tentativaTitulo, fonteTentativa);
    } else {
      // NADA: Realmente a API não devolveu nada (ou deu erro)
      this._writeToAudit(channelName, originalTitle, cleanTitle, 0, 'NADA ENCONTRADO', '-');
    }

    return this._applySmartPlaceholder(programme, placeholderImageUrl);
  }

  // --- GRAVAÇÃO NO CSV (Lógica de Status) ---
  _writeToAudit(channel, original, search, confidence, resultTitle, source) {
    const numericScore = (typeof confidence === 'string' ? parseFloat(confidence) : confidence);

    // Define status baseado no Threshold real
    const isSuccess = numericScore >= this.threshold || numericScore === 100;

    let status = '❌ NADA';
    if (isSuccess) {
      status = '✅ OK';
    } else if (numericScore > 0) {
      status = '⚠️ REJEITADO'; // Agora vai aparecer!
    }

    const safeOriginal = original ? original.replace(/;/g, ',') : '';
    const safeSearch = search ? search.replace(/;/g, ',') : '';
    const safeResult = resultTitle ? resultTitle.replace(/;/g, ',') : '-';

    const line = `"${channel}";"${safeOriginal}";"${safeSearch}";${status};${confidence}%;"${safeResult}";${source}\n`;
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