const xmlParser = require('./xmlParser');
const logger = require('./utils/logger');
const MatchingService = require('./services/matchingService');
const CacheService = require('./services/cacheService');
const StatsService = require('./services/statsService');
const NotificationService = require('./services/notificationService');
const BackupService = require('./services/backupService');

// Importar APIs
const TMDbAPI = require('./apis/tmdb');
const TVDbAPI = require('./apis/tvdb');
const OMDbAPI = require('./apis/omdb');
const PlexAPI = require('./apis/plex');
const PlexDBAPI = require('./apis/plexdb');
const IMDbAPI = require('./apis/imdb');

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
        case 'imdb':
          if (config.api.imdb.enabled) apis.push(new IMDbAPI());
          break;
      }
    });

    this.matchingService = new MatchingService(
      ...apis,
      config,
      this.cacheService
    );
  }

  async run(dryRun = false, apiServer = null) {
    const statsService = new StatsService();
    const notificationService = new NotificationService(this.config);
    const backupService = new BackupService(this.config);

    try {
      statsService.start();
      logger.info(`Iniciando processo de enriquecimento${dryRun ? ' (DRY RUN)' : ''}...`);

      if (apiServer) apiServer.emitLog('info', 'Inicializando conexões de API...');
      logger.info('Inicializando conexões de API...');
      for (const api of this.matchingService.apis) {
        if (api.initialize) {
          await api.initialize();
        }
      }

      // Criar backup antes de processar
      if (!dryRun) {
        backupService.backup();
      }

      // 1. Baixar/Ler XML
      const xmlData = await xmlParser.fetchXml(this.config.tvheadend);
      logger.info(`XML baixado com sucesso (${xmlData.length} bytes)`);
      if (apiServer) apiServer.emitLog('info', `XML baixado: ${xmlData.length} bytes`);

      // 2. Parse XML
      const result = await xmlParser.parseXml(xmlData);
      const programmes = result.tv.programme;

      if (!programmes || programmes.length === 0) {
        logger.warn('Nenhum programa encontrado no XML.');
        return;
      }

      // --- NOVIDADE: Mapear ID do Canal -> Nome do Canal ---
      const channelMap = {};
      if (result.tv.channel) {
        result.tv.channel.forEach(c => {
          if (c.$ && c.$.id && c['display-name']) {
            // display-name pode ser array ou objeto dependendo do parser
            const dn = c['display-name'][0];
            const name = (typeof dn === 'object' && dn._) ? dn._ : dn;
            channelMap[c.$.id] = name;
          }
        });
        logger.info(`Mapeados ${Object.keys(channelMap).length} canais.`);
      }
      // -----------------------------------------------------

      logger.info(`Total de programas a enriquecer: ${programmes.length}`);
      statsService.stats.totalPrograms = programmes.length;
      if (apiServer) apiServer.emitLog('info', `Processando ${programmes.length} programas...`);

      // 3. Enriquecimento
      const enrichedProgrammes = [];
      const total = programmes.length;
      const batchSize = this.config.processing.concurrency || 1;

      logger.info(`Processando com concorrência: ${batchSize} threads simultâneas`);

      for (let i = 0; i < total; i += batchSize) {
        const batch = programmes.slice(i, i + batchSize);

        const batchPromises = batch.map(async (prog) => {
          // Descobre o nome do canal deste programa
          const channelId = prog.$ ? prog.$.channel : null;
          const channelName = channelMap[channelId] || channelId || 'Desconhecido';
          const progTitle = prog.title && prog.title[0] ? (typeof prog.title[0] === 'object' ? prog.title[0]._ : prog.title[0]) : 'Sem título';

          // Log detalhado do programa sendo processado
          logger.debug(`Processando: ${progTitle} (${channelName})`);

          // Passa o channelName como 3º argumento
          const enriched = await this.matchingService.enrichProgram(prog, this.config.output.placeholderImage, channelName);
          
          // Atualizar estatísticas baseado na fonte de enriquecimento
          if (enriched._wasEnriched) {
            statsService.incrementEnriched();
            
            // Contar por fonte
            const source = enriched._enrichmentSource;
            if (source === 'cache') {
              statsService.incrementCacheHits();
            } else if (source && source !== 'placeholder') {
              // Contar chamada de API
              statsService.incrementApiCall(source);
            }
            
            logger.debug(`✓ Enriquecido (${source}): ${progTitle}`);
          } else {
            statsService.incrementFailed();
            logger.debug(`✗ Não enriquecido: ${progTitle}`);
          }
          
          // Limpar propriedades internas antes de retornar
          delete enriched._wasEnriched;
          delete enriched._enrichmentSource;

          return enriched;
        });

        const batchResults = await Promise.all(batchPromises);
        enrichedProgrammes.push(...batchResults);

        // Log mais frequente de progresso
        const percent = Math.round(((i + batch.length) / total) * 100);
        const processed = i + batch.length;
        logger.info(`Progresso: ${percent}% (${processed}/${total} programas)`);
      }

      // 4. Reconstruir XML
      result.tv.programme = enrichedProgrammes;
      const builder = new (require('xml2js').Builder)();
      const newXml = builder.buildObject(result);

      // 5. Salvar (ou não, se for dry run)
      const fs = require('fs');
      if (dryRun) {
        logger.info('🧪 DRY RUN: XML não foi salvo (modo de teste)');
        if (apiServer) apiServer.emitLog('info', '🧪 DRY RUN concluído - XML não salvo');
      } else {
        fs.writeFileSync(this.config.output.path, newXml);
        logger.info(`Arquivo XML salvo em: ${this.config.output.path}`);
        if (apiServer) apiServer.emitLog('info', `✅ XML salvo: ${this.config.output.path}`);
      }

      // Finalizar estatísticas
      statsService.end();
      const finalStats = statsService.save();

      // Enviar notificação
      if (!dryRun && finalStats) {
        await notificationService.send(finalStats);
      }

      // Atualizar estado da API
      if (apiServer && finalStats) {
        apiServer.updateState({ lastStats: finalStats });
      }

    } catch (error) {
      logger.error(`Erro durante execução: ${error.message}`);
      if (error.stack) logger.debug(error.stack);
      statsService.addError(error);
      if (apiServer) apiServer.emitLog('error', `Erro: ${error.message}`);
    } finally {
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