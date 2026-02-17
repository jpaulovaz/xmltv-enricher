const config = require('./config');
const logger = require('./utils/logger');
const Enricher = require('./enricher');
const APIServer = require('./api/server');
const Scheduler = require('./scheduler');

async function main() {
  try {
    logger.info('Iniciando XMLTV Enricher...');
    logger.info('Validando configuração...');

    // --- BLOCO DE LOGS RESTAURADO (Visibilidade do Sistema) ---
    // Validação visual das APIs ativas
    if (config.api.tvdb && config.api.tvdb.key) logger.info('✓ TVDb API configurada');
    if (config.api.tmdb && config.api.tmdb.key) logger.info('✓ TMDb API configurada');
    if (config.api.omdb && config.api.omdb.key) logger.info('✓ OMDb API configurada');

    if (config.api.plex) {
      if (config.api.plex.token) logger.info('✓ Plex API configurada');
      if (config.api.plex.dbEnabled) logger.info('✓ PlexDB (Acesso direto) habilitado');
    }

    // Verifica se existe algum provedor ativo
    const hasProvider =
      (config.api.tvdb && config.api.tvdb.key) ||
      (config.api.tmdb && config.api.tmdb.key) ||
      (config.api.omdb && config.api.omdb.key) ||
      (config.api.plex && (config.api.plex.token || config.api.plex.dbEnabled));

    if (!hasProvider) {
      logger.warn('AVISO: Nenhuma API externa ou banco local configurado. O enriquecimento será limitado ou nulo.');
    }

    // Logs de performance
    if (config.processing) {
      // Nota: scheduleHours pode vir de config.processing ou do padrão do Scheduler
      const interval = config.processing.scheduleIntervalHours || config.processing.scheduleHours || 12;
      logger.info(`Intervalo de agendamento: ${interval} horas`);
      logger.info(`Nível de Concorrência: ${config.processing.concurrency || 1} threads`);
    }
    // -----------------------------------------------------------

    // 1. Inicializar Enricher
    const enricher = new Enricher(config);

    // 2. Inicializar Scheduler (Passando config e enricher)
    // Isso usa a nova classe Scheduler que permite controle via API
    const scheduler = new Scheduler(config, enricher);

    // 3. Inicializar API Server (Dashboard e REST API)
    // O Server precisa do scheduler para comandos de pause/resume/run
    const apiServer = new APIServer(config, enricher, scheduler);

    // Iniciar servidor API
    await apiServer.start();

    // --- CONEXÃO CRÍTICA RESTAURADA ---
    // Conecta o logger ao WebSocket para que a aba "Logs" funcione
    logger.connectWebSocket(apiServer);

    // 4. Iniciar Scheduler (PASSANDO O APISERVER AGORA)
    // Isso conecta as pontas: Scheduler -> avisa -> APIServer -> avisa -> Dashboard
    scheduler.start(apiServer);

    // Tratamento de encerramento gracioso
    const shutdown = async () => {
      logger.info('Recebido sinal de encerramento. Parando serviços...');
      scheduler.stop();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error(`Erro fatal na inicialização: ${error.message}`);
    if (error.stack) logger.debug(error.stack);
    process.exit(1);
  }
}

// Tratamento de erros não capturados (Segurança Extra)
process.on('uncaughtException', (error) => {
  logger.error(`Erro não capturado: ${error.message}`);
  if (error.stack) logger.debug(error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promessa rejeitada não tratada');
  logger.debug(reason);
});

main();