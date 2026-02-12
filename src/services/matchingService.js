const logger = require('../utils/logger');
const {
  extractCleanTitle,
  cleanSeriesInfo,
  extractYearFromTitle
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

    // AUDITORIA EM STREAM (Item 5)
    this.auditFilePath = path.join(process.cwd(), 'auditoria_enricher.csv');
    if (!fs.existsSync(this.auditFilePath)) {
      fs.writeFileSync(this.auditFilePath, "\ufeffTítulo Original;Busca;Status;Confiança;Resultado API;Fonte\n", 'utf-8');
    }
    this.auditStream = fs.createWriteStream(this.auditFilePath, { flags: 'a', encoding: 'utf-8' });
  }

  async enrichProgram(programme, placeholderImageUrl) {
    const originalTitle = programme.title?.[0] || 'Unknown';
    const yearFromTitle = extractYearFromTitle(originalTitle);
    const cleanTitle = extractCleanTitle(originalTitle);

    const titlesToTry = [
      cleanTitle,
      cleanSeriesInfo(cleanTitle),
      cleanTitle.split(/[:\-(]/)[0].trim()
    ].filter((v, i, a) => v && v.length > 1 && a.indexOf(v) === i);

    const titlesToSkipApi = new Set();

    // FASE 1: CACHE (Agora com AWAIT pois é SQLite)
    for (const title of titlesToTry) {
      try {
        const cached = await this.cacheService.get(title, yearFromTitle);
        if (cached) {
          if (!cached.notFound) {
            logger.info(`✓ Encontrado em cache: "${title}"`);
            this._writeToAudit(originalTitle, title, 'Cache', 100, cached.title);
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

    if (bestEnriched) {
      logger.info(`✓ Enriquecido via ${finalSource}: "${usedTitle}" (confiança: ${bestScore}%)`);
      this.cacheService.set(usedTitle, yearFromTitle, bestEnriched);
      this._writeToAudit(originalTitle, usedTitle, finalSource, bestScore, bestEnriched.title);
      return this._applyEnrichment(programme, bestEnriched, placeholderImageUrl);
    }

    const statusMsg = titlesToSkipApi.size > 0 ? " (Cache Negativo)" : "";
    logger.warn(`✗ Nenhuma API retornou dados com confiança >= ${this.threshold}% para: "${cleanTitle}"${statusMsg}`);

    this._writeToAudit(originalTitle, cleanTitle, '-', 0, 'NADA ENCONTRADO');
    return this._applyPlaceholder(programme, placeholderImageUrl);
  }

  _writeToAudit(original, search, source, confidence, resultTitle) {
    const status = (typeof confidence === 'string' ? parseFloat(confidence) : confidence) >= this.threshold || confidence === 100 ? '✅ OK' : '❌ NADA';
    const line = `"${original.replace(/;/g, ',')}";"${search.replace(/;/g, ',')}";${status};${confidence}%;"${resultTitle ? resultTitle.replace(/;/g, ',') : '-'}";${source}\n`;
    this.auditStream.write(line);
  }

  saveAuditCSV() { } // Método legado mantido vazio

  _applyEnrichment(programme, data, placeholder) {
    const prog = { ...programme };
    prog.icon = [{ $: { src: data.image || placeholder } }];
    if (data.genres) prog.category = data.genres.map(g => ({ _: g, $: { lang: 'pt-BR' } }));
    if (data.year) prog.date = [data.year.toString()];
    return prog;
  }

  _applyPlaceholder(programme, placeholder) {
    const prog = { ...programme };
    prog.icon = [{ $: { src: placeholder } }];
    return prog;
  }
}

module.exports = MatchingService;