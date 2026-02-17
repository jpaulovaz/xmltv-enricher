const path = require('path');
require('dotenv').config(); // Garante que o dotenv seja carregado no topo

// Caminho do .env no diretório raiz do projeto
const envPath = path.resolve(__dirname, '..', '.env');

// Função para carregar/recarregar as variáveis do .env (Mantida do seu original)
function loadEnv() {
  // Limpar cache do dotenv para permitir reload
  try {
    const dotenvPath = require.resolve('dotenv');
    delete require.cache[dotenvPath];
  } catch (e) { }

  // Recarregar .env
  require('dotenv').config({ path: envPath, override: true });
}

// Helpers (Mantidos do seu original)
const getInt = (key, defaultVal) => {
  const value = parseInt(process.env[key], 10);
  return isNaN(value) ? defaultVal : value;
};

const getBool = (key, defaultVal = false) => {
  const value = process.env[key];
  if (value === undefined || value === '') return defaultVal;
  return value === 'true' || value === '1';
};

// Objeto de configuração com Getters (Sua estrutura original preservada)
const config = {
  // Propriedades estáticas
  envPath: envPath,
  loadEnv: loadEnv,

  // Getter para tvheadend
  get tvheadend() {
    const user = process.env.TVHEADEND_USERNAME || '';
    const pass = process.env.TVHEADEND_PASSWORD || '';

    return {
      url: process.env.TVHEADEND_URL || 'http://localhost:9981',
      user: user,
      username: user, // Alias para compatibilidade
      pass: pass,     // Usado pelo seu código original
      password: pass  // Alias para compatibilidade futura/padrão
    };
  },

  // Getter para api
  get api() {
    return {
      priority: (process.env.API_PRIORITY_ORDER || 'plex,tvdb,tmdb,omdb,imdb').split(','),
      language: process.env.API_LANGUAGE || 'pt-BR',
      tmdb: { key: process.env.TMDB_API_KEY || '' },
      tvdb: { key: process.env.TVDB_API_KEY || '', pin: process.env.TVDB_PIN || '' },
      omdb: { key: process.env.OMDB_API_KEY || '' },
      imdb: { enabled: getBool('IMDB_ENABLED', false) },
      plex: {
        url: process.env.PLEX_URL || 'http://localhost:32400',
        token: process.env.PLEX_TOKEN || '',
        dbEnabled: getBool('PLEX_DB_ENABLED', false),
        dbPath: process.env.PLEX_DB_PATH || ''
      }
    };
  },

  // Getter para processing
  get processing() {
    return {
      concurrency: getInt('CONCURRENCY_LIMIT', 1),
      // CORREÇÃO DO BUG: Renomeado para scheduleIntervalHours para bater com o Scheduler
      scheduleIntervalHours: getInt('SCHEDULE_INTERVAL_HOURS', 12),
      runOnStart: getBool('RUN_ON_START', false)
    };
  },

  // Getter para matching
  get matching() {
    return {
      algorithm: process.env.MATCHING_ALGORITHM || 'jaro_winkler',
      confidenceThreshold: getInt('CONFIDENCE_THRESHOLD', 85)
    };
  },

  // Getter para output
  get output() {
    return {
      path: process.env.OUTPUT_FILE_PATH || './output/xmltv.xml',
      placeholderImage: process.env.PLACEHOLDER_IMAGE_URL || ''
    };
  },

  // Getter para cache
  get cache() {
    return {
      enabled: getBool('CACHE_ENABLED', true),
      ttlHours: getInt('CACHE_TTL_HOURS', 72)
    };
  },

  // Getter para backup (Novo recurso da v2.1)
  get backup() {
    return {
      enabled: getBool('BACKUP_ENABLED', true),
      maxBackups: getInt('MAX_BACKUPS', 5)
    };
  },

  // Getter para logging
  get logging() {
    return {
      level: process.env.LOG_LEVEL || 'info',
      file: process.env.LOG_FILE || '',
      debugUrls: getBool('DEBUG_URLS', false)
    };
  },

  // Getter para notification (Novo recurso da v2.1)
  get notification() {
    return {
      webhookUrl: process.env.WEBHOOK_URL || '',
      webhookType: process.env.WEBHOOK_TYPE || 'generic'
    };
  }
};

module.exports = config;