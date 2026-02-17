const cron = require('node-cron');
const logger = require('./utils/logger');

class Scheduler {
  constructor(config, enricher) {
    this.config = config;
    this.enricher = enricher;
    this.task = null;
    this.isRunning = false;
    this.paused = false;
    this.apiServer = null; // Guardará a referência do servidor
  }

  // Agora aceita apiServer como parâmetro opcional
  start(apiServer = null) {
    this.apiServer = apiServer;
    const interval = this.config.processing.scheduleIntervalHours || 12;
    // Converte horas para cron (ex: "0 */12 * * *")
    const cronExpression = `0 */${interval} * * *`;

    logger.info(`Scheduler iniciado. Intervalo: ${interval} hora(s). (Cron: ${cronExpression})`);

    this.task = cron.schedule(cronExpression, () => {
      this.runTask();
    });

    // Se configurado para rodar ao iniciar
    if (this.config.processing.runOnStart) {
      logger.info('Configuração runOnStart ativa. Executando agora...');
      // Pequeno delay para garantir que o servidor subiu
      setTimeout(() => this.runTask(), 5000);
    }
  }

  stop() {
    if (this.task) {
      this.task.stop();
      logger.info('Scheduler parado.');
    }
  }

  pause() {
    this.paused = true;
    logger.info('Scheduler pausado.');
  }

  resume() {
    this.paused = false;
    logger.info('Scheduler retomado.');
  }

  async runTask() {
    if (this.paused) {
      logger.warn('Tarefa agendada ignorada (Scheduler pausado).');
      return;
    }

    if (this.isRunning) {
      logger.warn('Tarefa agendada ignorada (Enricher já está rodando).');
      return;
    }

    this.isRunning = true;
    try {
      logger.info('🕒 Iniciando execução agendada...');
      // AQUI ESTÁ A CORREÇÃO: Passamos o this.apiServer para o enricher
      await this.enricher.run(false, this.apiServer);
    } catch (error) {
      logger.error(`Erro na execução agendada: ${error.message}`);
    } finally {
      this.isRunning = false;

      // Atualizar status no front-end informando que acabou (idle)
      if (this.apiServer) {
        this.apiServer.updateState({ running: false, lastRun: new Date() });
      }
    }
  }
}

module.exports = Scheduler;