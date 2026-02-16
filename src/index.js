const config = require('./config');
const logger = require('./utils/logger');
const scheduler = require('./scheduler');
const Enricher = require('./enricher');
const APIServer = require('./api/server');

let apiServer = null;

async function initialize() {
  logger.info('Iniciando XMLTV Enricher...');
  logger.info('Validando configuração...');

  // Validação segura das APIs (Verifica se o objeto existe antes de ler a chave)
  if (config.api.tvdb && config.api.tvdb.key) logger.info('✓ TVDb API configurada');
  if (config.api.tmdb && config.api.tmdb.key) logger.info('✓ TMDb API configurada');
  if (config.api.omdb && config.api.omdb.key) logger.info('✓ OMDb API configurada');

  // Ajuste para a nova estrutura do Plex no config.js
  if (config.api.plex) {
    if (config.api.plex.token) logger.info('✓ Plex API configurada');
    if (config.api.plex.dbEnabled) logger.info('✓ PlexDB (Acesso direto) habilitado');
  }

  // Verifica se pelo menos uma fonte está ativa
  const hasProvider =
    (config.api.tvdb && config.api.tvdb.key) ||
    (config.api.tmdb && config.api.tmdb.key) ||
    (config.api.omdb && config.api.omdb.key) ||
    (config.api.plex && (config.api.plex.token || config.api.plex.dbEnabled));

  if (!hasProvider) {
    logger.warn('AVISO: Nenhuma API externa ou banco local configurado. O enriquecimento será limitado ou nulo.');
  }

  // Logs da nova configuração de performance
  if (config.processing) {
    logger.info(`Intervalo de agendamento: ${config.processing.scheduleHours} horas`);
    logger.info(`Nível de Concorrência: ${config.processing.concurrency || 1} threads`);
  }

  // Iniciar API Server (Dashboard e REST API)
  const enricher = new Enricher(config);
  apiServer = new APIServer(config, enricher, scheduler);
  await apiServer.start();

  // Conectar logger ao WebSocket para emitir todos os logs
  logger.connectWebSocket(apiServer);

  // Iniciar o scheduler
  scheduler.start();

  // Executar imediatamente na inicialização (opcional via env)
  if (process.env.RUN_ON_START !== 'false') {
    logger.info('Executando primeira rodada imediatamente...');
    try {
      await enricher.run(false, apiServer);
    } catch (err) {
      logger.error(`Erro ao executar Enricher: ${err.message}`);
    }
  }
}

// Tratamento de erros não capturados para evitar crash total silencioso
process.on('uncaughtException', (error) => {
  logger.error(`Erro não capturado: ${error.message}`);
  if (error.stack) logger.debug(error.stack);
  // Em produção, o PM2 vai reiniciar o processo
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promessa rejeitada não tratada');
  logger.debug(reason);
});

initialize();