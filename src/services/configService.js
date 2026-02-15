const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class ConfigService {
  constructor() {
    this.envPath = path.join(process.cwd(), '.env');
  }

  /**
   * Lê todas as configurações do .env
   */
  readConfig() {
    try {
      if (!fs.existsSync(this.envPath)) {
        return this._getDefaultConfig();
      }

      const envContent = fs.readFileSync(this.envPath, 'utf-8');
      const config = {};

      envContent.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#') && line.includes('=')) {
          const [key, ...valueParts] = line.split('=');
          const value = valueParts.join('=').trim();
          config[key.trim()] = value;
        }
      });

      return this._mergeWithDefaults(config);
    } catch (error) {
      logger.error(`Erro ao ler configurações: ${error.message}`);
      return this._getDefaultConfig();
    }
  }

  /**
   * Salva configurações no .env
   */
  saveConfig(newConfig) {
    try {
      // Validar configurações
      const validation = this._validateConfig(newConfig);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Criar backup do .env atual
      if (fs.existsSync(this.envPath)) {
        const backupPath = `${this.envPath}.backup`;
        fs.copyFileSync(this.envPath, backupPath);
      }

      // Construir conteúdo do .env
      const envContent = this._buildEnvContent(newConfig);

      // Salvar arquivo
      fs.writeFileSync(this.envPath, envContent, 'utf-8');

      logger.info('✅ Configurações salvas com sucesso');

      return { success: true, message: 'Configurações salvas. Reinicie o aplicativo para aplicar.' };
    } catch (error) {
      logger.error(`Erro ao salvar configurações: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Validar configurações
   */
  _validateConfig(config) {
    // Validações básicas
    if (config.API_PORT && (isNaN(config.API_PORT) || config.API_PORT < 1 || config.API_PORT > 65535)) {
      return { valid: false, error: 'Porta da API inválida (deve ser entre 1 e 65535)' };
    }

    if (config.SCHEDULE_INTERVAL_HOURS && (isNaN(config.SCHEDULE_INTERVAL_HOURS) || config.SCHEDULE_INTERVAL_HOURS < 1)) {
      return { valid: false, error: 'Intervalo de agendamento inválido (mínimo 1 hora)' };
    }

    if (config.CONCURRENCY_LIMIT && (isNaN(config.CONCURRENCY_LIMIT) || config.CONCURRENCY_LIMIT < 1)) {
      return { valid: false, error: 'Limite de concorrência inválido (mínimo 1)' };
    }

    if (config.CONFIDENCE_THRESHOLD && (isNaN(config.CONFIDENCE_THRESHOLD) || config.CONFIDENCE_THRESHOLD < 0 || config.CONFIDENCE_THRESHOLD > 100)) {
      return { valid: false, error: 'Threshold de confiança inválido (0-100)' };
    }

    return { valid: true };
  }

  /**
   * Construir conteúdo do arquivo .env
   */
  _buildEnvContent(config) {
    const sections = {
      'Tvheadend': ['TVHEADEND_URL', 'TVHEADEND_USERNAME', 'TVHEADEND_PASSWORD'],
      'APIs de Metadados': ['TVDB_API_KEY', 'TVDB_PIN', 'TMDB_API_KEY', 'OMDB_API_KEY', 'PLEX_URL', 'PLEX_TOKEN', 'PLEX_DB_ENABLED', 'PLEX_DB_PATH'],
      'Prioridade de APIs': ['API_PRIORITY_ORDER'],
      'Processamento': ['SCHEDULE_INTERVAL_HOURS', 'CONCURRENCY_LIMIT', 'RUN_ON_START'],
      'Cache': ['CACHE_ENABLED', 'CACHE_TTL_HOURS'],
      'Matching': ['MATCHING_ALGORITHM', 'CONFIDENCE_THRESHOLD'],
      'Output': ['OUTPUT_FILE_PATH', 'PLACEHOLDER_IMAGE_URL'],
      'Logging': ['LOG_LEVEL', 'LOG_FILE', 'DEBUG_URLS'],
      'API Server': ['API_PORT'],
      'Backup': ['BACKUP_ENABLED', 'BACKUP_DIR', 'MAX_BACKUPS'],
      'Notificações': ['WEBHOOK_URL', 'WEBHOOK_TYPE']
    };

    let content = '# XMLTV Enricher - Configuração\n';
    content += `# Atualizado em: ${new Date().toISOString()}\n\n`;

    for (const [section, keys] of Object.entries(sections)) {
      content += `# ========================================\n`;
      content += `# ${section.toUpperCase()}\n`;
      content += `# ========================================\n`;

      keys.forEach(key => {
        const value = config[key] !== undefined ? config[key] : '';
        content += `${key}=${value}\n`;
      });

      content += '\n';
    }

    return content;
  }

  /**
   * Configurações padrão
   */
  _getDefaultConfig() {
    return {
      TVHEADEND_URL: 'http://localhost:9981',
      TVHEADEND_USERNAME: '',
      TVHEADEND_PASSWORD: '',
      TVDB_API_KEY: '',
      TVDB_PIN: '',
      TMDB_API_KEY: '',
      OMDB_API_KEY: '',
      PLEX_URL: 'http://localhost:32400',
      PLEX_TOKEN: '',
      PLEX_DB_ENABLED: 'false',
      PLEX_DB_PATH: '',
      API_PRIORITY_ORDER: 'plex,tvdb,tmdb,omdb',
      SCHEDULE_INTERVAL_HOURS: '12',
      CONCURRENCY_LIMIT: '3',
      RUN_ON_START: 'true',
      CACHE_ENABLED: 'true',
      CACHE_TTL_HOURS: '24',
      MATCHING_ALGORITHM: 'jaro_winkler',
      CONFIDENCE_THRESHOLD: '85',
      OUTPUT_FILE_PATH: './output/xmltv.xml',
      PLACEHOLDER_IMAGE_URL: 'https://via.placeholder.com/300x450?text=Sem+Capa',
      LOG_LEVEL: 'info',
      LOG_FILE: '/var/log/xmltv-enricher.log',
      DEBUG_URLS: 'false',
      API_PORT: '3000',
      BACKUP_ENABLED: 'true',
      BACKUP_DIR: './backups',
      MAX_BACKUPS: '5',
      WEBHOOK_URL: '',
      WEBHOOK_TYPE: 'generic'
    };
  }

  /**
   * Mesclar com padrões
   */
  _mergeWithDefaults(config) {
    const defaults = this._getDefaultConfig();
    return { ...defaults, ...config };
  }
}

module.exports = ConfigService;
