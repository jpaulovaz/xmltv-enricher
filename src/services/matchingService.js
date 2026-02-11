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
    this.auditLog = [];
    this.auditFilePath = path.join(process.cwd(), 'auditoria_enricher.csv');
  }

  async enrichProgram(programme, placeholderImageUrl) {
    const originalTitle = programme.title?.[0] || 'Unknown';
    const yearFromTitle = extractYearFromTitle(originalTitle);
    const cleanTitle = extractCleanTitle(originalTitle);

    // Estratégia de Múltiplas Tentativas
    const titlesToTry = [
      cleanTitle,                             // 1. Original Limpo
      cleanSeriesInfo(cleanTitle),            // 2. Regex Inteligente
      cleanTitle.split(/[:\-(]/)[0].trim()    // 3. Corte Agressivo
    ].filter((v, i, a) => v && v.length > 1 && a.indexOf(v) === i);

    const titlesToSkipApi = new Set(); // Lista negra temporária para esta execução

    // --- FASE 1: CACHE (Verificar Sucessos e Falhas conhecidas) ---
    for (const title of titlesToTry) {
      try {
        const cached = this.cacheService.get(title, yearFromTitle);
        if (cached) {
          // Se for um sucesso salvo, retorna imediatamente
          if (!cached.notFound) {
            logger.info(`✓ Encontrado em cache: "${title}"`);
            this._addToAudit(originalTitle, title, 'Cache', 100, cached.title);
            return this._applyEnrichment(programme, cached, placeholderImageUrl);
          }
          // Se for um cache negativo (falha conhecida), marcamos para não consultar API
          else {
            titlesToSkipApi.add(title);
          }
        }
      } catch (e) { }
    }

    // --- FASE 2: APIS ---
    let bestEnriched = null;
    let bestScore = 0;
    let usedTitle = '-';
    let finalSource = '-';

    for (const titleToTry of titlesToTry) {
      // Se já sabemos que esse título não existe (Cache Negativo), pulamos
      if (titlesToSkipApi.has(titleToTry)) {
        continue;
      }

      let foundForThisTitle = false;

      for (const api of this.apis) {
        try {
          if (api.constructor.name === 'TVDbAPI') await api.authenticate();

          const yearsToTry = yearFromTitle ? [yearFromTitle, null] : [null];

          for (const yearAttempt of yearsToTry) {
            const enriched = await api.enrichProgram(titleToTry, yearAttempt);

            if (enriched) {
              let score = this.fuzzyMatcher.calculateSimilarity(titleToTry, enriched.title || titleToTry);

              if (score < this.threshold && score > 40) {
                if (!yearAttempt) score += 20;
              }

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

      // NOVIDADE: Se tentamos todas as APIs para este título específico e não achamos nada...
      // Gravamos um CACHE NEGATIVO para não tentar de novo nos próximos episódios.
      if (!foundForThisTitle && !bestEnriched) {
        try {
          // Salva { notFound: true } no cache
          this.cacheService.set(titleToTry, yearFromTitle, { notFound: true });
          // logger.debug(`Cache Negativo criado para: "${titleToTry}"`); 
        } catch (e) { }
      }

      if (bestScore >= 95) break;
    }

    // Sucesso
    if (bestEnriched) {
      logger.info(`✓ Enriquecido via ${finalSource}: "${usedTitle}" (confiança: ${bestScore}%)`);
      this.cacheService.set(usedTitle, yearFromTitle, bestEnriched);
      this._addToAudit(originalTitle, usedTitle, finalSource, bestScore, bestEnriched.title);
      this.saveAuditCSV();
      return this._applyEnrichment(programme, bestEnriched, placeholderImageUrl);
    }

    // Falha Total
    // Se caiu aqui, pode ser porque pulamos as APIs (cache negativo) ou porque as APIs falharam agora.
    const statusMsg = titlesToSkipApi.size > 0 ? " (Cache Negativo)" : "";
    logger.warn(`✗ Nenhuma API retornou dados com confiança >= ${this.threshold}% para: "${cleanTitle}"${statusMsg}`);

    this._addToAudit(originalTitle, cleanTitle, '-', 0, 'NADA ENCONTRADO');
    this.saveAuditCSV();
    return this._applyPlaceholder(programme, placeholderImageUrl);
  }

  _addToAudit(original, search, source, confidence, resultTitle) {
    const status = confidence >= this.threshold ? '✅ OK' : '❌ NADA';
    if (this.auditLog.length > 2000) this.auditLog.shift();
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
      if (this.auditLog.length % 20 === 0) {
        let csv = "\ufeffTítulo Original;Busca;Status;Confiança;Resultado API;Fonte\n";
        this.auditLog.forEach(row => {
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
    if (data.rating) prog.rating = [{ value: [data.rating], $: { system: 'BR' } }];
    return prog;
  }

  _applyPlaceholder(programme, placeholder) {
    const prog = { ...programme };
    prog.icon = [{ $: { src: placeholder } }];
    return prog;
  }
}

module.exports = MatchingService;