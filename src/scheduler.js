const cron = require('node-cron');
const logger = require('./utils/logger');

class Scheduler {
  constructor(config, enricher) {
    this.config = config;
    this.enricher = enricher;
    this.task = null;
    this.isRunning = false;
  }

  /**
   * Converter horas para expressão cron
   * Formato: segundo minuto hora dia_mês mês dia_semana
   */
  hoursToExpression(hours) {
    if (hours < 1 || hours > 24) {
      throw new Error('Intervalo deve estar entre 1 e 24 horas');
    }

    // Se for divisor de 24, usar horas exatas
    if (24 % hours === 0) {
      const step = 24 / hours;
      // Executa a cada N horas (ex: 12 horas = 0 0 0,12 * * *)
      const hours_list = [];
      for (let i = 0; i < 24; i += hours) {
        hours_list.push(i);
      }
      return `0 0 ${hours_list.join(',')} * * *`;
    }

    // Caso especial para 30 minutos
    if (hours === 0.5) {
      return '0 */30 * * * *'; // A cada 30 minutos
    }

    // Caso especial para 15 minutos
    if (hours === 0.25) {
      return '0 */15 * * * *'; // A cada 15 minutos
    }

    // Para outros intervalos, executar a cada hora no minuto calculado
    const minutes = Math.round((hours % 1) * 60);
    return `${minutes} 0 * * * *`;
  }

  /**
   * Iniciar agendador
   */
  start() {
    try {
      const intervalHours = this.config.schedule.intervalHours;
      const expression = this.hoursToExpression(intervalHours);

      logger.info(`Iniciando agendador com intervalo de ${intervalHours} hora(s)`);
      logger.info(`Expressão cron: ${expression}`);

      // Executar imediatamente na inicialização
      logger.info('Executando enriquecimento inicial...');
      this.run();

      // Agendar execuções subsequentes
      this.task = cron.schedule(expression, () => {
        this.run();
      });

      logger.info('✓ Agendador iniciado com sucesso');
      return true;

    } catch (error) {
      logger.error(`Erro ao iniciar agendador: ${error.message}`);
      return false;
    }
  }

  /**
   * Parar agendador
   */
  stop() {
    try {
      if (this.task) {
        this.task.stop();
        logger.info('✓ Agendador parado');
      }
    } catch (error) {
      logger.error(`Erro ao parar agendador: ${error.message}`);
    }
  }

  /**
   * Executar enriquecimento
   */
  async run() {
    if (this.isRunning) {
      logger.warn('Enriquecimento já está em execução, pulando esta execução');
      return;
    }

    this.isRunning = true;

    try {
      const result = await this.enricher.run();
      
      if (result && result.success) {
        logger.info(`Próxima execução em ${this.config.schedule.intervalHours} hora(s)`);
      }

    } catch (error) {
      logger.error(`Erro durante execução agendada: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Obter status
   */
  getStatus() {
    return {
      running: this.isRunning,
      scheduled: !!this.task,
      intervalHours: this.config.schedule.intervalHours
    };
  }
}

module.exports = Scheduler;
