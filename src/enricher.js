const xmlParser = require('./xmlParser');
const logger = require('./utils/logger');
const MatchingService = require('./services/matchingService');
const CacheService = require('./services/cacheService');

// Importar APIs
const TMDbAPI = require('./apis/tmdb');
const TVDbAPI = require('./apis/tvdb');
const OMDbAPI = require('./apis/omdb');
const PlexAPI = require('./apis/plex');
const PlexDBAPI = require('./apis/plexdb');

class Enricher {
  constructor(config) {
    this.config = config;
    this.cacheService = new CacheService(config);

    const apis = [];

    config.api.priority.forEach(apiName => {
      switch (apiName.trim().toLowerCase()) {
        case 'plex':
          if (config.api.plex.token) apis.push(new PlexAPI(config.api.plex.url, config.api.plex.token));
          break;
        case 'plexdb':
          if (config.api.plex.dbEnabled) apis.push(new PlexDBAPI(config.api.plex.dbPath));
          break;
        case 'tmdb':
          if (config.api.tmdb.key) apis.push(new TMDbAPI(config.api.tmdb.key));
          break;
        case 'tvdb':
          if (config.api.tvdb.key) apis.push(new TVDbAPI(config.api.tvdb.key, config.api.tvdb.pin));
          break;
        case 'omdb':
          if (config.api.omdb.key) apis.push(new OMDbAPI(config.api.omdb.key));
          break;
      }
    });

    this.matchingService = new MatchingService(
      ...apis,
      config,
      this.cacheService
    );
  }

  async run() {
    try {
      logger.info('Iniciando processo de enriquecimento...');

      // 1. INICIALIZAÇÃO DE APIs (NOVIDADE: Prepara o banco 1 vez só)
      logger.info('Inicializando conexões de API...');
      for (const api of this.matchingService.apis) {
        if (api.initialize) {
          await api.initialize();
        }
      }

      // 2. Baixar/Ler XML
      const xmlData = await xmlParser.fetchXml(this.config.tvheadend);
      logger.info(`XML baixado com sucesso (${xmlData.length} bytes)`);

      // 3. Parse XML
      const result = await xmlParser.parseXml(xmlData);
      const programmes = result.tv.programme;

      if (!programmes || programmes.length === 0) {
        logger.warn('Nenhum programa encontrado no XML.');
        return;
      }

      logger.info(`Total de programas a enriquecer: ${programmes.length}`);

      // 4. Enriquecimento (Lotes)
      const enrichedProgrammes = [];
      const total = programmes.length;
      const batchSize = this.config.processing.concurrency || 1;

      logger.info(`Processando com concorrência: ${batchSize} threads simultâneas`);

      for (let i = 0; i < total; i += batchSize) {
        const batch = programmes.slice(i, i + batchSize);

        const batchPromises = batch.map(prog =>
          this.matchingService.enrichProgram(prog, this.config.output.placeholderImage)
        );

        const batchResults = await Promise.all(batchPromises);
        enrichedProgrammes.push(...batchResults);

        if ((i + batchSize) % 50 < batchSize) {
          const percent = Math.round(((i + batch.length) / total) * 100);
          logger.info(`Progresso: ${percent}% (${i + batch.length}/${total})`);
        }
      }

      // 5. Reconstruir XML
      result.tv.programme = enrichedProgrammes;
      const builder = new (require('xml2js').Builder)();
      const newXml = builder.buildObject(result);

      // 6. Salvar
      const fs = require('fs');
      fs.writeFileSync(this.config.output.path, newXml);
      logger.info(`Arquivo XML salvo em: ${this.config.output.path}`);

    } catch (error) {
      logger.error(`Erro durante execução: ${error.message}`);
      if (error.stack) logger.debug(error.stack);
    } finally {
      // 7. LIMPEZA FINAL (NOVIDADE: Fecha o banco e apaga o arquivo)
      logger.info('Encerrando conexões...');
      if (this.matchingService && this.matchingService.apis) {
        for (const api of this.matchingService.apis) {
          if (api.shutdown) {
            api.shutdown();
          }
        }
      }

      if (this.cacheService.cleanup) await this.cacheService.cleanup();
    }
  }
}

module.exports = Enricher;