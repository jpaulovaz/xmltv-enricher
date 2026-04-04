const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class StatsService {
  constructor() {
    this.stats = {
      startTime: null,
      endTime: null,
      duration: 0,
      totalPrograms: 0,
      eligiblePrograms: 0,
      enrichedPrograms: 0,
      failedPrograms: 0,
      skippedPrograms: 0,
      rejectedPrograms: 0,
      notFoundPrograms: 0,
      cacheHits: 0,
      apiCalls: {
        tmdb: 0,
        tvdb: 0,
        omdb: 0,
        plex: 0,
        plexdb: 0,
        imdb: 0,
        manual_override: 0
      },
      skipReasons: {},
      errors: []
    };
  }

  start() {
    this.stats.startTime = new Date().toISOString();
  }

  end() {
    this.stats.endTime = new Date().toISOString();
    const start = new Date(this.stats.startTime);
    const end = new Date(this.stats.endTime);
    this.stats.duration = Math.round((end - start) / 1000);
  }

  incrementEnriched() {
    this.stats.enrichedPrograms++;
  }

  incrementFailed() {
    this.stats.failedPrograms++;
  }

  incrementSkipped(reason = 'unknown') {
    this.stats.skippedPrograms++;
    this.stats.skipReasons[reason] = (this.stats.skipReasons[reason] || 0) + 1;
  }

  incrementRejected() {
    this.stats.rejectedPrograms++;
  }

  incrementNotFound() {
    this.stats.notFoundPrograms++;
  }

  incrementCacheHits() {
    this.stats.cacheHits++;
  }

  incrementApiCall(apiName) {
    const normalizedName = apiName.toLowerCase();
    if (this.stats.apiCalls[normalizedName] !== undefined) {
      this.stats.apiCalls[normalizedName]++;
    }
  }

  addError(error) {
    this.stats.errors.push({
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }

  registerProgrammeResult(programme) {
    this.stats.totalPrograms++;

    if (programme?._eligibleForMatching !== false) {
      this.stats.eligiblePrograms++;
    }

    if (programme?._wasEnriched) {
      this.incrementEnriched();
      const source = programme._enrichmentSource;
      if (source === 'cache') {
        this.incrementCacheHits();
      } else if (source) {
        this.incrementApiCall(source);
      }
      return;
    }

    switch (programme?._matchOutcome) {
      case 'skipped':
        this.incrementSkipped(programme?._skipReason || 'unknown');
        break;
      case 'rejected_low_confidence':
        this.incrementRejected();
        this.incrementFailed();
        break;
      case 'not_found':
        this.incrementNotFound();
        this.incrementFailed();
        break;
      default:
        this.incrementFailed();
        break;
    }
  }

  getStats() {
    const eligibleBase = this.stats.eligiblePrograms > 0 ? this.stats.eligiblePrograms : 0;
    return {
      ...this.stats,
      successRate: this.stats.totalPrograms > 0
        ? Math.round((this.stats.enrichedPrograms / this.stats.totalPrograms) * 100)
        : 0,
      eligibleSuccessRate: eligibleBase > 0
        ? Math.round((this.stats.enrichedPrograms / eligibleBase) * 100)
        : 0,
      skipRate: this.stats.totalPrograms > 0
        ? Math.round((this.stats.skippedPrograms / this.stats.totalPrograms) * 100)
        : 0,
      cacheHitRate: this.stats.totalPrograms > 0
        ? Math.round((this.stats.cacheHits / this.stats.totalPrograms) * 100)
        : 0
    };
  }

  save() {
    try {
      const statsPath = path.join(process.cwd(), 'stats.json');
      const finalStats = this.getStats();

      fs.writeFileSync(statsPath, JSON.stringify(finalStats, null, 2));
      logger.info(`Estatísticas salvas em: ${statsPath}`);

      logger.info('=== RESUMO DA EXECUÇÃO ===');
      logger.info(`Total de programas: ${finalStats.totalPrograms}`);
      logger.info(`Elegíveis para busca: ${finalStats.eligiblePrograms}`);
      logger.info(`Enriquecidos: ${finalStats.enrichedPrograms} (${finalStats.successRate}% do total | ${finalStats.eligibleSuccessRate}% dos elegíveis)`);
      logger.info(`Ignorados por heurística: ${finalStats.skippedPrograms} (${finalStats.skipRate}%)`);
      logger.info(`Rejeitados por baixa confiança: ${finalStats.rejectedPrograms}`);
      logger.info(`Não encontrados: ${finalStats.notFoundPrograms}`);
      logger.info(`Falhas totais: ${finalStats.failedPrograms}`);
      logger.info(`Cache hits: ${finalStats.cacheHits} (${finalStats.cacheHitRate}%)`);
      logger.info(`Duração: ${finalStats.duration}s`);
      logger.info('========================');

      return finalStats;
    } catch (error) {
      logger.error(`Erro ao salvar estatísticas: ${error.message}`);
      return null;
    }
  }
}

module.exports = StatsService;
