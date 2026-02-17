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
    this.cacheService = args[args.length - 1];
    const configArg = args[args.length - 2];
    this.apis = args.slice(0, -2).filter(api => api !== null);

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
    fs.writeFileSync(this.auditFilePath, "\ufeffCanal;Título Original;Busca;Status;Confiança;Resultado API;Fonte\n", 'utf-8');
    logger.info(`Arquivo de auditoria criado: ${this.auditFilePath}`);
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
    const cleanTitle = extractCleanTitle(originalTitle);
    const activePlaceholder = this._getDynamicPlaceholder(channelName, placeholderImageUrl);

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

    // FASE 2: APIS (COM LÓGICA DE ALIAS)
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
              // 1. Tenta Score com título principal da API
              let score = this.fuzzyMatcher.calculateSimilarity(titleToTry, enriched.title || titleToTry);
              let currentMatchViaAlias = false;
              let currentAliasUsed = '';

              // 2. Se falhar, tenta Original Title (se disponível na API)
              if (score < this.threshold && enriched.original_title) {
                const originalScore = this.fuzzyMatcher.calculateSimilarity(titleToTry, enriched.original_title);
                if (originalScore > score) {
                  score = originalScore;
                  currentMatchViaAlias = true;
                  currentAliasUsed = enriched.original_title;
                }
              }

              // 3. Se ainda falhar, tenta Aliases (TMDb)
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

              // Bônus para ano
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

    // FASE 3: DECISÃO FINAL
    if (bestEnriched && bestScore >= this.threshold) {
      const aliasSuffix = matchViaAlias ? ` (Match encontrado via Alias: ${aliasUsed})` : '';
      logger.info(`✓ Enriquecido via ${finalSource}: "${usedTitle}" (confiança: ${bestScore}%)${aliasSuffix}`);

      this.cacheService.set(usedTitle, yearFromTitle, bestEnriched);
      this._writeToAudit(channelName, originalTitle, usedTitle, bestScore, bestEnriched.title, finalSource, aliasSuffix);

      const enrichedProg = this._applyEnrichment(programme, bestEnriched, activePlaceholder);
      enrichedProg._enrichmentSource = finalSource;
      enrichedProg._wasEnriched = true;
      return enrichedProg;
    }

    // LOGS DE FALHA... (Mantidos como no original)
    const statusMsg = titlesToSkipApi.size > 0 ? " (Cache Negativo)" : "";
    logger.warn(`✗ Nenhuma API retornou dados com confiança >= ${this.threshold}% para: "${cleanTitle}"${statusMsg}`);

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

    let status = '❌ NADA';
    if (isSuccess) status = '✅ OK';
    else if (numericScore > 0) status = '⚠️ REJEITADO';

    const safeOriginal = original ? original.replace(/;/g, ',') : '';
    const safeSearch = search ? search.replace(/;/g, ',') : '';
    const safeResult = resultTitle ? resultTitle.replace(/;/g, ',') : '-';

    // Adicionamos a informação de Alias no Resultado para sua Auditoria ficar completa
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