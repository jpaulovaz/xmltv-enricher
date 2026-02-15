const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');

class ConfigService {
  constructor() {
    // Usar o caminho definido no config.js para garantir consistência
    this.envPath = config.envPath;
    this.configCache = null;
    this.apiServer = null;
    
    // Log do caminho para debug
    console.log(`[ConfigService] ENV Path: ${this.envPath}`);
    console.log(`[ConfigService] ENV exists: ${fs.existsSync(this.envPath)}`);
    
    // Criar arquivo .env se não existir
    if (!fs.existsSync(this.envPath)) {
      console.log(`[ConfigService] Criando .env com configurações padrão...`);
      this.saveConfig(this._getDefaultConfig());
    }
  }

  /**
   * Define referência ao apiServer para reload em tempo real
   */
  setApiServer(apiServer) {
    this.apiServer = apiServer;
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

      this.configCache = this._mergeWithDefaults(config);
      return this.configCache;
    } catch (error) {
      logger.error(`Erro ao ler configurações: ${error.message}`);
      return this._getDefaultConfig();
    }
  }

  /**
   * Salva configurações no .env e atualiza process.env
   */
  saveConfig(newConfig) {
    try {
      console.log(`[ConfigService] Salvando configurações em: ${this.envPath}`);
      
      // Validar configurações
      const validation = this._validateConfig(newConfig);
      if (!validation.valid) {
        console.log(`[ConfigService] Validação falhou: ${validation.error}`);
        return { success: false, error: validation.error };
      }

      // Mesclar com configurações existentes
      const currentConfig = this.readConfig();
      const mergedConfig = { ...currentConfig, ...newConfig };

      // Criar backup do .env atual
      if (fs.existsSync(this.envPath)) {
        const backupPath = `${this.envPath}.backup`;
        fs.copyFileSync(this.envPath, backupPath);
        console.log(`[ConfigService] Backup criado: ${backupPath}`);
      }

      // Construir conteúdo do .env
      const envContent = this._buildEnvContent(mergedConfig);

      // Salvar arquivo
      fs.writeFileSync(this.envPath, envContent, 'utf-8');
      console.log(`[ConfigService] Arquivo salvo: ${this.envPath}`);
      
      // Verificar se o arquivo foi salvo
      if (fs.existsSync(this.envPath)) {
        const savedContent = fs.readFileSync(this.envPath, 'utf-8');
        console.log(`[ConfigService] Arquivo salvo com ${savedContent.length} bytes`);
      }

      // Atualizar process.env para aplicação imediata
      Object.keys(mergedConfig).forEach(key => {
        process.env[key] = mergedConfig[key];
      });

      // Atualizar cache
      this.configCache = mergedConfig;

      logger.info('✅ Configurações salvas e aplicadas com sucesso');
      logger.info(`📁 Arquivo: ${this.envPath}`);

      return { 
        success: true, 
        message: 'Configurações salvas com sucesso! Algumas mudanças (como porta do servidor) requerem reinício.',
        appliedImmediately: true,
        savedTo: this.envPath
      };
    } catch (error) {
      logger.error(`Erro ao salvar configurações: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Testa conexão com Tvheadend
   */
  async testTvheadendConnection(url, username, password) {
    const axios = require('axios');
    try {
      const testUrl = `${url}/api/serverinfo`;
      const config = {};
      
      if (username && password) {
        config.auth = { username, password };
      }
      config.timeout = 10000;

      const response = await axios.get(testUrl, config);
      return { 
        success: true, 
        message: 'Conexão com Tvheadend bem sucedida!',
        version: response.data?.sw_version || 'Desconhecida'
      };
    } catch (error) {
      let errorMsg = 'Falha ao conectar com Tvheadend';
      if (error.code === 'ECONNREFUSED') {
        errorMsg = 'Conexão recusada - verifique se o Tvheadend está rodando';
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        errorMsg = 'Timeout - servidor não respondeu';
      } else if (error.response?.status === 401) {
        errorMsg = 'Credenciais inválidas';
      } else if (error.response?.status === 403) {
        errorMsg = 'Acesso negado - verifique permissões';
      }
      return { success: false, message: errorMsg };
    }
  }

  /**
   * Testa conexão com Plex
   */
  async testPlexConnection(url, token) {
    const axios = require('axios');
    try {
      const testUrl = `${url}/identity`;
      const config = {
        headers: { 'X-Plex-Token': token },
        timeout: 10000
      };

      const response = await axios.get(testUrl, config);
      return { 
        success: true, 
        message: 'Conexão com Plex bem sucedida!',
        serverName: response.data?.MediaContainer?.friendlyName || 'Desconhecido'
      };
    } catch (error) {
      let errorMsg = 'Falha ao conectar com Plex';
      if (error.code === 'ECONNREFUSED') {
        errorMsg = 'Conexão recusada - verifique se o Plex está rodando';
      } else if (error.response?.status === 401) {
        errorMsg = 'Token inválido';
      }
      return { success: false, message: errorMsg };
    }
  }

  /**
   * Testa API key do TMDb
   */
  async testTmdbApiKey(apiKey) {
    const axios = require('axios');
    try {
      const testUrl = `https://api.themoviedb.org/3/configuration?api_key=${apiKey}`;
      await axios.get(testUrl, { timeout: 10000 });
      return { success: true, message: 'API Key do TMDb válida!' };
    } catch (error) {
      if (error.response?.status === 401) {
        return { success: false, message: 'API Key inválida' };
      }
      return { success: false, message: 'Erro ao validar API Key' };
    }
  }

  /**
   * Testa API key do OMDb
   */
  async testOmdbApiKey(apiKey) {
    const axios = require('axios');
    try {
      const testUrl = `http://www.omdbapi.com/?apikey=${apiKey}&t=test`;
      const response = await axios.get(testUrl, { timeout: 10000 });
      if (response.data?.Error === 'Invalid API key!') {
        return { success: false, message: 'API Key inválida' };
      }
      return { success: true, message: 'API Key do OMDb válida!' };
    } catch (error) {
      return { success: false, message: 'Erro ao validar API Key' };
    }
  }

  /**
   * Validar configurações
   */
  _validateConfig(config) {
    const errors = [];

    // Validar URL do Tvheadend
    if (config.TVHEADEND_URL && !this._isValidUrl(config.TVHEADEND_URL)) {
      errors.push('URL do Tvheadend inválida');
    }

    // Validar URL do Plex
    if (config.PLEX_URL && !this._isValidUrl(config.PLEX_URL)) {
      errors.push('URL do Plex inválida');
    }

    // Validar porta
    if (config.API_PORT) {
      const port = parseInt(config.API_PORT, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        errors.push('Porta da API inválida (deve ser entre 1 e 65535)');
      }
    }

    // Validar intervalo de agendamento
    if (config.SCHEDULE_INTERVAL_HOURS) {
      const hours = parseInt(config.SCHEDULE_INTERVAL_HOURS, 10);
      if (isNaN(hours) || hours < 1) {
        errors.push('Intervalo de agendamento inválido (mínimo 1 hora)');
      }
    }

    // Validar concorrência
    if (config.CONCURRENCY_LIMIT) {
      const limit = parseInt(config.CONCURRENCY_LIMIT, 10);
      if (isNaN(limit) || limit < 1 || limit > 10) {
        errors.push('Limite de concorrência inválido (1-10)');
      }
    }

    // Validar threshold de confiança
    if (config.CONFIDENCE_THRESHOLD) {
      const threshold = parseInt(config.CONFIDENCE_THRESHOLD, 10);
      if (isNaN(threshold) || threshold < 0 || threshold > 100) {
        errors.push('Threshold de confiança inválido (0-100)');
      }
    }

    if (errors.length > 0) {
      return { valid: false, error: errors.join('; ') };
    }

    return { valid: true };
  }

  /**
   * Validar URL
   */
  _isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
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
   * Configurações padrão - RUN_ON_START = false por padrão
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
      RUN_ON_START: 'false',
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
