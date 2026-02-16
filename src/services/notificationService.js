const axios = require('axios');
const logger = require('../utils/logger');

class NotificationService {
  constructor(config) {
    this.webhookUrl = process.env.WEBHOOK_URL;
    this.webhookType = process.env.WEBHOOK_TYPE || 'generic'; // generic, discord, slack
    this.enabled = !!this.webhookUrl;
  }

  async send(stats) {
    if (!this.enabled) {
      logger.debug('Notificações desabilitadas (WEBHOOK_URL não configurado)');
      return;
    }

    try {
      let payload;

      switch (this.webhookType) {
        case 'discord':
          payload = this._buildDiscordPayload(stats);
          break;
        case 'slack':
          payload = this._buildSlackPayload(stats);
          break;
        default:
          payload = stats;
      }

      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      logger.info('✅ Notificação enviada com sucesso');
    } catch (error) {
      logger.error(`Erro ao enviar notificação: ${error.message}`);
    }
  }

  _buildDiscordPayload(stats) {
    const color = stats.successRate >= 80 ? 3066993 : stats.successRate >= 50 ? 15844367 : 15158332;
    
    return {
      embeds: [{
        title: '📺 XMLTV Enricher - Execução Concluída',
        color: color,
        fields: [
          { name: 'Total de Programas', value: stats.totalPrograms.toString(), inline: true },
          { name: 'Enriquecidos', value: `${stats.enrichedPrograms} (${stats.successRate}%)`, inline: true },
          { name: 'Falhas', value: stats.failedPrograms.toString(), inline: true },
          { name: 'Cache Hits', value: `${stats.cacheHits} (${stats.cacheHitRate}%)`, inline: true },
          { name: 'Duração', value: `${stats.duration}s`, inline: true },
          { name: 'APIs Usadas', value: Object.entries(stats.apiCalls).filter(([k, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join('\n') || 'Nenhuma' }
        ],
        timestamp: new Date().toISOString()
      }]
    };
  }

  _buildSlackPayload(stats) {
    const emoji = stats.successRate >= 80 ? ':white_check_mark:' : stats.successRate >= 50 ? ':warning:' : ':x:';
    
    return {
      text: `${emoji} *XMLTV Enricher - Execução Concluída*`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Total:* ${stats.totalPrograms} | *Enriquecidos:* ${stats.enrichedPrograms} (${stats.successRate}%) | *Falhas:* ${stats.failedPrograms}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Cache Hits:* ${stats.cacheHits} (${stats.cacheHitRate}%) | *Duração:* ${stats.duration}s`
          }
        }
      ]
    };
  }
}

module.exports = NotificationService;
