const logger = require('./utils/logger');
const config = require('./config');
const XMLTVEnricher = require('./enricher');
const Scheduler = require('./scheduler');

/**
 * Inicializar aplicação
 */
async function initialize() {
  try {
    logger.info('╔════════════════════════════════════════════════════════════╗');
    logger.info('║         XMLTV Enricher - Iniciando Aplicação              ║');
    logger.info('╚════════════════════════════════════════════════════════════╝');

    // Validar configuração
    logger.info('Validando configuração...');
    if (!config.apis.plexdb.enabled && !config.apis.plex.enabled && !config.apis.tvdb.enabled && !config.apis.tmdb.enabled && !config.apis.omdb.enabled) {
      throw new Error('Nenhuma API está configurada! Configure pelo menos uma chave de API no arquivo .env');
    }

    logger.info('Configuração:');
    logger.info(`  - Tvheadend URL: ${config.tvheadend.url}`);
    logger.info(`  - Arquivo de saída: ${config.output.filePath}`);
    logger.info(`  - Intervalo: ${config.schedule.intervalHours} hora(s)`);
    logger.info(`  - Cache: ${config.cache.enabled ? 'Ativado' : 'Desativado'} (TTL: ${config.cache.ttlHours}h)`);
    logger.info(`  - APIs: ${[
      config.apis.plexdb.enabled ? 'Plex Database (Principal)' : null,
      config.apis.plex.enabled ? 'Plex API' : null,
      config.apis.tvdb.enabled ? 'TVDb' : null,
      config.apis.tmdb.enabled ? 'TMDb' : null,
      config.apis.omdb.enabled ? 'OMDb' : null
    ].filter(Boolean).join(', ')}`);

    // Criar enriquecedor
    const enricher = new XMLTVEnricher(config);
    
    // Inicializar enriquecedor (async)
    await enricher.initialize();

    // Criar agendador
    const scheduler = new Scheduler(config, enricher);

    // Iniciar agendador
    const started = scheduler.start();

    if (!started) {
      throw new Error('Falha ao iniciar agendador');
    }

    // Tratadores de sinais para graceful shutdown
    process.on('SIGINT', () => {
      logger.info('\n╔════════════════════════════════════════════════════════════╗');
      logger.info('║         Encerrando aplicação (SIGINT)...                   ║');
      logger.info('╚════════════════════════════════════════════════════════════╝');
      scheduler.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('\n╔════════════════════════════════════════════════════════════╗');
      logger.info('║         Encerrando aplicação (SIGTERM)...                  ║');
      logger.info('╚════════════════════════════════════════════════════════════╝');
      scheduler.stop();
      process.exit(0);
    });

    logger.info('╔════════════════════════════════════════════════════════════╗');
    logger.info('║         Aplicação iniciada com sucesso!                   ║');
    logger.info('║         Pressione Ctrl+C para encerrar                    ║');
    logger.info('╚════════════════════════════════════════════════════════════╝');

  } catch (error) {
    logger.error(`Erro fatal durante inicialização: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Iniciar aplicação
initialize();
