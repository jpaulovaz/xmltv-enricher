const cron = require('node-cron');
const config = require('./config');
const logger = require('./utils/logger');
const Enricher = require('./enricher');

let task = null;
let isPaused = false;

const start = () => {
  if (task) {
    logger.warn('Scheduler já está rodando.');
    return;
  }

  // Pega o intervalo do novo local no config (padrão 12h)
  const hours = config.processing && config.processing.scheduleHours
    ? config.processing.scheduleHours
    : 12;

  // Cron pattern: minuto 0, a cada X horas
  const cronExpression = `0 */${hours} * * *`;

  logger.info(`Agendador iniciado. Execução programada a cada ${hours} horas (Cron: "${cronExpression}")`);

  task = cron.schedule(cronExpression, async () => {
    if (isPaused) {
      logger.info('⏸️ Scheduler pausado. Execução ignorada.');
      return;
    }

    logger.info('⏳ Iniciando execução agendada do Enricher...');
    try {
      // Instancia o Enricher com a configuração global
      const enricher = new Enricher(config);
      await enricher.run();
    } catch (error) {
      logger.error(`Erro na execução agendada: ${error.message}`);
    }
  });
};

const stop = () => {
  if (task) {
    task.stop();
    task = null;
    isPaused = false;
    logger.info('Scheduler parado.');
  }
};

const pause = () => {
  if (!task) {
    logger.warn('Scheduler não está rodando.');
    return false;
  }
  isPaused = true;
  logger.info('⏸️ Scheduler pausado.');
  return true;
};

const resume = () => {
  if (!task) {
    logger.warn('Scheduler não está rodando.');
    return false;
  }
  isPaused = false;
  logger.info('▶️ Scheduler retomado.');
  return true;
};

const isPausedStatus = () => isPaused;

module.exports = {
  start,
  stop,
  pause,
  resume,
  isPausedStatus
};