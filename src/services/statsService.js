const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class StatsService {
  constructor() {
    this.stats = {
      startTime: null,
      endTime: null,
      totalPrograms: 0,
      enrichedPrograms: 0,
      failedPrograms: 0,
      cacheHits: 0,
      apiCalls: {
        tmdb: 0,
        tvdb: 0,
        omdb: 0,
        plex: 0,
        plexdb: 0,
        imdb: 0
      },
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
    this.stats.duration = Math.round((end - start) / 1000); // segundos
  }

  incrementTotal() {
    this.stats.totalPrograms++;
  }

  incrementEnriched() {
    this.stats.enrichedPrograms++;
  }

  incrementFailed() {
    this.stats.failedPrograms++;
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

  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalPrograms > 0 
        ? Math.round((this.stats.enrichedPrograms / this.stats.totalPrograms) * 100) 
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
      
      // Log resumo
      logger.info('=== RESUMO DA EXECUÇÃO ===');
      logger.info(`Total de programas: ${finalStats.totalPrograms}`);
      logger.info(`Enriquecidos: ${finalStats.enrichedPrograms} (${finalStats.successRate}%)`);
      logger.info(`Falhas: ${finalStats.failedPrograms}`);
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
