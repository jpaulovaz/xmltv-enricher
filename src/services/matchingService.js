const logger = require('../utils/logger');
const config = require('../config');
const {
  extractCleanTitle,
  cleanSeriesInfo,
  extractYearFromTitle,
  parseEpisodeInfo,
  convertToXmltvNs,
  buildTitleSearchCandidates,
  detectProgrammeContext,
  normalizeTitle,
  getProgrammeTextField
} = require('../utils/helpers');
const FuzzyMatcher = require('../utils/fuzzyMatcher');
const fs = require('fs');
const path = require('path');

let placeholdersConfig = { styles: {}, channels: {} };
try {
  placeholdersConfig = require('../config/placeholders.json');
} catch (e) {
  logger.warn('Arquivo src/config/placeholders.json não encontrado. Usando fallback padrão.');
}

class MatchingService {
  constructor(...args) {
    const lastArg = args[args.length - 1];
    const isManualOverrideService = lastArg !== null && typeof lastArg === 'object' &&
      (typeof lastArg.get === 'function' || typeof lastArg.add === 'function');

    this.manualOverrideService = isManualOverrideService ? lastArg : null;

    const configIndex = args.length - 3;
    const cacheServiceIndex = args.length - 2;

    this.cacheService = args[cacheServiceIndex];
    const configArg = args[configIndex];

    if (!configArg || !configArg.matching) {
      throw new Error('MatchingService: config nao foi passado corretamente. Verifique a ordem dos argumentos no constructor.');
    }

    this.apis = args.slice(0, -3).filter(api => api !== null);
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
    fs.writeFileSync(this.auditFilePath, '\ufeffCanal;Título Original;Busca;Status;Confiança;Resultado API;Fonte\n', 'utf-8');
    logger.info('MatchingService inicializado.');
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
    const originalTitle = getProgrammeTextField(programme?.title) || 'Unknown';
    const context = detectProgrammeContext(programme, channelName);
    const yearFromTitle = extractYearFromTitle(originalTitle);
    const activePlaceholder = this._getDynamicPlaceholder(channelName, placeholderImageUrl);
    const cacheContext = {
      channel: channelName,
      expectedType: context.expectedType || ''
    };

    const titleVariations = buildTitleSearchCandidates(originalTitle);
    const anchorTitle = extractCleanTitle(cleanSeriesInfo(originalTitle)) || titleVariations[0] || originalTitle;

    if (this.manualOverrideService) {
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
        logger.info(`Override manual identificado: "${originalTitle}" (chave: "${overrideKey}") -> TMDb ID ${override.tmdbId}`);
        const tmdbApi = this.apis.find(api => api.constructor.name === 'TMDbAPI');
        if (tmdbApi && typeof tmdbApi.enrichById === 'function') {
          try {
            const enriched = await tmdbApi.enrichById(override.tmdbId, override.type);
            if (enriched && enriched.title) {
              this._writeToAudit(channelName, originalTitle, `ID: ${override.tmdbId}`, 100, enriched.title, 'Manual Override');
              const result = this._applyEnrichment(programme, enriched, activePlaceholder);
              result._enrichmentSource = 'manual_override';
              result._wasEnriched = true;
              result._matchOutcome = 'enriched';
              result._eligibleForMatching = true;
              return result;
            }
          } catch (error) {
            logger.error(`Erro ao buscar dados do override (ID ${override.tmdbId}): ${error.message}`);
          }
        }
      }
    }

    if (!context.shouldSearch) {
      logger.info(`Ignorando busca para "${originalTitle}" (${context.skipReason})`);
      this._writeToAudit(channelName, originalTitle, anchorTitle, 0, context.skipReason, 'SKIP');
      const placeholderProg = this._applySmartPlaceholder(programme, activePlaceholder);
      placeholderProg._enrichmentSource = 'placeholder';
      placeholderProg._wasEnriched = false;
      placeholderProg._matchOutcome = 'skipped';
      placeholderProg._skipReason = context.skipReason;
      placeholderProg._eligibleForMatching = false;
      return placeholderProg;
    }

    const titlesToSkipApi = new Set();

    for (const title of titleVariations) {
      try {
        const cached = await this.cacheService.get(title, yearFromTitle, cacheContext);
        if (!cached) continue;

        if (!cached.notFound) {
          logger.info(`Encontrado em cache: "${title}"`);
          this._writeToAudit(channelName, originalTitle, title, 100, cached.title, 'Cache');
          const enrichedProg = this._applyEnrichment(programme, cached, activePlaceholder);
          enrichedProg._enrichmentSource = 'cache';
          enrichedProg._wasEnriched = true;
          enrichedProg._matchOutcome = 'enriched';
          enrichedProg._eligibleForMatching = true;
          return enrichedProg;
        }

        titlesToSkipApi.add(title);
      } catch (e) {
        // noop
      }
    }

    let bestCandidate = null;

    for (const titleToTry of titleVariations) {
      if (titlesToSkipApi.has(titleToTry)) continue;

      for (const api of this.apis) {
        try {
          if (api.initialize) await api.initialize();
          if (api.constructor.name === 'TVDbAPI') await api.authenticate();

          const yearsToTry = yearFromTitle ? [yearFromTitle, null] : [null];
          for (const yearAttempt of yearsToTry) {
            const enriched = await api.enrichProgram(titleToTry, yearAttempt);
            if (!enriched) continue;

            const evaluation = this._evaluateCandidate(titleToTry, originalTitle, enriched, {
              year: yearFromTitle,
              expectedType: context.expectedType,
              anchorTitle
            });

            if (!bestCandidate || evaluation.score > bestCandidate.score) {
              bestCandidate = {
                titleToTry,
                enriched,
                source: enriched.source || api.constructor.name,
                yearAttempt,
                ...evaluation
              };
            }

            if (bestCandidate && bestCandidate.score >= 98) break;
          }
        } catch (error) {
          logger.debug(`Falha ao consultar ${api.constructor.name} para "${titleToTry}": ${error.message}`);
        }

        if (bestCandidate && bestCandidate.score >= 98) break;
      }

      if (bestCandidate && bestCandidate.score >= 98) break;
    }

    if (bestCandidate && bestCandidate.score >= this.threshold) {
      const aliasSuffix = bestCandidate.matchedField !== 'title' ? ` (${bestCandidate.matchedField}: ${bestCandidate.matchedValue})` : '';
      logger.info(`Enriquecido via ${bestCandidate.source}: "${bestCandidate.titleToTry}" (${bestCandidate.score}%)${aliasSuffix}`);
      await this.cacheService.set(bestCandidate.titleToTry, yearFromTitle, bestCandidate.enriched, cacheContext);
      this._writeToAudit(
        channelName,
        originalTitle,
        bestCandidate.titleToTry,
        bestCandidate.score,
        bestCandidate.enriched.title,
        bestCandidate.source,
        aliasSuffix
      );
      const enrichedProg = this._applyEnrichment(programme, bestCandidate.enriched, activePlaceholder);
      enrichedProg._enrichmentSource = bestCandidate.source;
      enrichedProg._wasEnriched = true;
      enrichedProg._matchOutcome = 'enriched';
      enrichedProg._eligibleForMatching = true;
      return enrichedProg;
    }

    const rejectionTitle = bestCandidate?.titleToTry || anchorTitle;
    const rejectionSource = bestCandidate?.source || '-';
    const rejectionScore = bestCandidate?.score || 0;
    const rejectionLabel = bestCandidate?.enriched?.title || 'NADA ENCONTRADO';

    logger.warn(`Nenhuma API retornou dados com confiança >= ${this.threshold}% para: "${originalTitle}"`);
    try {
      await this.cacheService.set(anchorTitle, yearFromTitle, { notFound: true }, cacheContext);
    } catch (e) {
      // noop
    }

    this._writeToAudit(channelName, originalTitle, rejectionTitle, rejectionScore, rejectionLabel, rejectionSource);

    const placeholderProg = this._applySmartPlaceholder(programme, activePlaceholder);
    placeholderProg._enrichmentSource = 'placeholder';
    placeholderProg._wasEnriched = false;
    placeholderProg._matchOutcome = rejectionScore > 0 ? 'rejected_low_confidence' : 'not_found';
    placeholderProg._eligibleForMatching = true;
    return placeholderProg;
  }

  _collectCandidateNames(enriched) {
    const candidates = [];
    const seen = new Set();

    const addCandidate = (value, field) => {
      if (!value) return;
      const normalized = normalizeTitle(value);
      if (!normalized || seen.has(`${field}:${normalized}`)) return;
      seen.add(`${field}:${normalized}`);
      candidates.push({ value, field });
    };

    addCandidate(enriched.title, 'title');
    addCandidate(enriched.original_title, 'original_title');

    if (enriched.alternative_titles?.titles && Array.isArray(enriched.alternative_titles.titles)) {
      enriched.alternative_titles.titles.forEach(item => {
        const value = typeof item === 'string' ? item : item?.title || item?.name;
        addCandidate(value, 'alias');
      });
    }

    return candidates;
  }

  _getBestScoreForReference(reference, candidateNames) {
    let best = {
      score: 0,
      similarity: 0,
      tokenOverlap: 0,
      tokenCoverage: 0,
      matchedValue: '',
      matchedField: 'title'
    };

    for (const candidate of candidateNames) {
      const composite = this.fuzzyMatcher.getCompositeScore(reference, candidate.value);
      if (composite.weighted > best.score) {
        best = {
          score: composite.weighted,
          similarity: composite.similarity,
          tokenOverlap: composite.tokenOverlap,
          tokenCoverage: composite.tokenCoverage,
          matchedValue: candidate.value,
          matchedField: candidate.field
        };
      }
    }

    return best;
  }

  _evaluateCandidate(searchTitle, originalTitle, enriched, context = {}) {
    const candidateNames = this._collectCandidateNames(enriched);
    const titleAnchors = buildTitleSearchCandidates(originalTitle).slice(0, 3);

    const bestForSearch = this._getBestScoreForReference(searchTitle, candidateNames);
    const supportScores = titleAnchors
      .filter(anchor => normalizeTitle(anchor) !== normalizeTitle(searchTitle))
      .map(anchor => this._getBestScoreForReference(anchor, candidateNames));

    const bestSupport = supportScores.reduce((acc, item) => item.score > acc.score ? item : acc, { score: 0 });
    let finalScore = bestForSearch.score;

    if (bestSupport.score > 0) {
      finalScore = Math.round((bestForSearch.score * 0.75) + (bestSupport.score * 0.25));
    }

    if (context.anchorTitle && normalizeTitle(context.anchorTitle) !== normalizeTitle(searchTitle)) {
      const anchorScore = this._getBestScoreForReference(context.anchorTitle, candidateNames);
      finalScore = Math.round((finalScore * 0.8) + (anchorScore.score * 0.2));
    }

    if (context.year && enriched.year) {
      const diff = Math.abs(Number(enriched.year) - Number(context.year));
      if (diff === 0) finalScore += 6;
      else if (diff === 1) finalScore += 2;
      else if (diff > 3) finalScore -= 18;
      else finalScore -= 8;
    } else if (context.year && !enriched.year) {
      finalScore -= 3;
    }

    if (context.expectedType === 'series') {
      if (enriched.type === 'series') finalScore += 6;
      if (enriched.type === 'movie') finalScore -= 12;
    }

    if (context.expectedType === 'movie') {
      if (enriched.type === 'movie') finalScore += 4;
      if (enriched.type === 'series') finalScore -= 8;
    }

    const strongExactMatch = bestForSearch.similarity >= 98 || normalizeTitle(searchTitle) === normalizeTitle(bestForSearch.matchedValue);
    const searchTokens = this.fuzzyMatcher.tokenize(searchTitle);

    if (!strongExactMatch) {
      if (searchTokens.length <= 2 && bestForSearch.tokenCoverage < 70 && finalScore < 96) {
        finalScore -= 12;
      }

      if (bestForSearch.tokenCoverage < 50) {
        finalScore -= 18;
      } else if (bestForSearch.tokenCoverage < 65) {
        finalScore -= 8;
      }

      if (bestForSearch.tokenOverlap < 50 && finalScore < 95) {
        finalScore -= 10;
      }
    } else if (bestSupport.score >= this.threshold) {
      finalScore += 4;
    }

    if (!enriched.image) {
      finalScore -= 4;
    }

    if (bestForSearch.matchedField !== 'title' && bestForSearch.score >= this.threshold) {
      finalScore += 2;
    }

    finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

    return {
      score: finalScore,
      matchedValue: bestForSearch.matchedValue,
      matchedField: bestForSearch.matchedField,
      similarity: bestForSearch.similarity,
      tokenOverlap: bestForSearch.tokenOverlap,
      tokenCoverage: bestForSearch.tokenCoverage,
      supportScore: bestSupport.score || 0
    };
  }

  _writeToAudit(channel, original, search, confidence, resultTitle, source, aliasSuffix = '') {
    const numericScore = (typeof confidence === 'string' ? parseFloat(confidence) : confidence) || 0;

    let status = 'Não Encontrado';
    if (source === 'SKIP') status = 'Ignorado por heurística';
    else if (numericScore >= this.threshold || numericScore === 100) status = aliasSuffix ? 'Correspondência por alias' : 'Correspondência encontrada';
    else if (numericScore > 0) status = 'Baixa confiança - rejeitado';

    const safeOriginal = original ? String(original).replace(/;/g, ',') : '';
    const safeSearch = search ? String(search).replace(/;/g, ',') : '';
    const safeResult = resultTitle ? String(resultTitle).replace(/;/g, ',') : '-';
    const finalResultDisplay = aliasSuffix ? `${safeResult}${aliasSuffix}` : safeResult;
    const line = `"${channel}";"${safeOriginal}";"${safeSearch}";${status};${numericScore}%;"${finalResultDisplay}";${source}\n`;

    try {
      fs.appendFileSync(this.auditFilePath, line, 'utf-8');
    } catch (e) {
      logger.error(`Erro ao escrever auditoria: ${e.message}`);
    }
  }

  _resolveContentRating(data) {
    const value = data.contentRating || data.rating || null;
    if (!value || typeof value !== 'string') return null;

    if (/^TV[- ]/i.test(value)) {
      return { system: 'TV Parental Guidelines', value };
    }

    if (/^(G|PG|PG-13|R|NC-17|NR|UNRATED)$/i.test(value)) {
      return { system: 'MPAA', value };
    }

    return { system: 'BR', value };
  }

  _applyEnrichment(programme, data, placeholder) {
    const prog = { ...programme };
    const lang = config.api.language || 'pt-BR';
    const existingIcon = programme?.icon?.[0]?.$?.src || null;
    const finalImage = data.image || existingIcon || placeholder;

    if (finalImage) {
      prog.icon = [{ $: { src: finalImage } }];
    }

    if (data.description && data.description.trim().length > 10) {
      prog.desc = [data.description.trim()];
    }

    if (Array.isArray(data.genres) && data.genres.length > 0) {
      prog.category = data.genres.map(g => ({ _: g, $: { lang } }));
    }

    if (data.year) {
      prog.date = [String(data.year)];
    }

    const contentRating = this._resolveContentRating(data);
    if (contentRating) {
      prog.rating = [{ value: [contentRating.value], $: { system: contentRating.system } }];
    }

    if (data.score && !Number.isNaN(Number(data.score))) {
      const scoreValue = Number(data.score).toFixed(1);
      prog['star-rating'] = [{ value: [`${scoreValue}/10`] }];
    }

    const originalTitle = getProgrammeTextField(programme?.title);
    const epInfo = parseEpisodeInfo(originalTitle);
    const xmltvNs = epInfo ? convertToXmltvNs(epInfo.season, epInfo.episode) : null;
    if (xmltvNs) {
      prog['episode-num'] = [{ _: xmltvNs, $: { system: 'xmltv_ns' } }];
    }

    return prog;
  }

  _applySmartPlaceholder(programme, dynamicPlaceholder) {
    const prog = { ...programme };
    const currentIcon = programme?.icon?.[0]?.$?.src || null;
    const finalImage = dynamicPlaceholder || currentIcon || null;

    const originalTitle = getProgrammeTextField(programme?.title);
    const epInfo = parseEpisodeInfo(originalTitle);
    const xmltvNs = epInfo ? convertToXmltvNs(epInfo.season, epInfo.episode) : null;
    if (xmltvNs) {
      prog['episode-num'] = [{ _: xmltvNs, $: { system: 'xmltv_ns' } }];
    }

    if (finalImage) {
      prog.icon = [{ $: { src: finalImage } }];
    }

    return prog;
  }

  closeAuditStream() { }
  saveAuditCSV() { }
}

module.exports = MatchingService;
