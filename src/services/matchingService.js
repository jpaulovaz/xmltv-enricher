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
    this.fuzzyMatcher = new FuzzyMatcher(config.matching.algorithm, config.matching.confidenceThreshold);
    this.threshold = config.matching.confidenceThreshold;
    this.auditLog = [];
    this.auditFilePath = path.join(process.cwd(), 'auditoria_enricher.csv');
  }

  async enrichProgram(programme, placeholderImageUrl) {
    const originalTitle = programme.title?.[0] || 'Unknown';
    const yearToSearch = extractYearFromTitle(originalTitle);
    const cleanTitle = extractCleanTitle(originalTitle);

    // Geramos todas as variações de uma vez
    const titlesToTry = [
      cleanTitle,
      cleanSeriesInfo(cleanTitle),
      cleanTitle.split(':')[0].trim()
    ].filter((v, i, a) => v && v.length > 0 && a.indexOf(v) === i);

    // --- FASE 1: VELOCIDADE MÁXIMA (TESTAR CACHE PARA TODAS AS VARIAÇÕES) ---
    for (const title of titlesToTry) {
      try {
        const cached = this.cacheService.get(title, yearToSearch);
        if (cached) {
          logger.info(`✓ Encontrado em cache: "${title}"`);
          this._addToAudit(originalTitle, title, 'Cache', 100, cached.title);
          return this._applyEnrichment(programme, cached, placeholderImageUrl);
        }
      } catch (e) { }
    }

    // --- FASE 2: BUSCA EXTERNA (SÓ SE O CACHE FALHAR EM TUDO) ---
    let bestEnriched = null;
    let bestScore = 0;
    let usedTitle = '-';
    let finalSource = '-';

    for (const titleToTry of titlesToTry) {
      for (const api of this.apis) {
        try {
          if (api.constructor.name === 'TVDbAPI') await api.authenticate();
          const enriched = await api.enrichProgram(titleToTry, yearToSearch || null);

          if (enriched) {
            const score = this.fuzzyMatcher.calculateSimilarity(titleToTry, enriched.title || titleToTry);
            if (score >= this.threshold && score > bestScore) {
              bestScore = score;
              bestEnriched = enriched;
              usedTitle = titleToTry;
              finalSource = enriched.source;
              if (bestScore >= 95) break;
            }
          }
        } catch (e) { }
      }
      if (bestScore >= 95) break;
    }

    if (bestEnriched) {
      logger.info(`✓ Enriquecido via ${finalSource}: "${usedTitle}" (confiança: ${bestScore}%)`);
      this.cacheService.set(usedTitle, yearToSearch, bestEnriched);
      this._addToAudit(originalTitle, usedTitle, finalSource, bestScore, bestEnriched.title);
      this.saveAuditCSV();
      return this._applyEnrichment(programme, bestEnriched, placeholderImageUrl);
    }

    logger.warn(`✗ Nenhuma API retornou dados com confiança >= ${this.threshold}% para: "${cleanTitle}"`);
    this._addToAudit(originalTitle, cleanTitle, '-', 0, 'NADA ENCONTRADO');
    this.saveAuditCSV();
    return this._applyPlaceholder(programme, placeholderImageUrl);
  }

  _addToAudit(original, search, source, confidence, resultTitle) {
    const status = confidence >= this.threshold ? '✅ OK' : '❌ NADA';
    this.auditLog.push({
      original: original.replace(/;/g, ','),
      search: search.replace(/;/g, ','),
      status,
      confidence: `${confidence}%`,
      result: resultTitle ? resultTitle.replace(/;/g, ',') : '-',
      source
    });
  }

  saveAuditCSV() {
    try {
      if (this.auditLog.length % 50 === 0) { // Salva o CSV a cada 50 itens para não pesar o disco toda hora
        let csv = "\ufeffTítulo Original;Busca;Status;Confiança;Resultado API;Fonte\n";
        this.auditLog.slice(-1000).forEach(row => {
          csv += `"${row.original}";"${row.search}";${row.status};${row.confidence};"${row.result}";${row.source}\n`;
        });
        fs.writeFileSync(this.auditFilePath, csv, 'utf-8');
      }
    } catch (err) { }
  }

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