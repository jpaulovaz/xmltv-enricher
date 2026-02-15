const path = require('path');
const fs = require('fs');

// Caminho do .env no diretório raiz do projeto
const envPath = path.resolve(__dirname, '..', '.env');

// Função para carregar/recarregar as variáveis do .env
function loadEnv() {
  // Limpar cache do dotenv para permitir reload
  delete require.cache[require.resolve('dotenv')];
  
  // Recarregar .env
  require('dotenv').config({ path: envPath, override: true });
  
  console.log(`[Config] Carregando .env de: ${envPath}`);
  console.log(`[Config] TVHEADEND_URL: ${process.env.TVHEADEND_URL || 'não definido'}`);
}

// Carregar inicialmente
loadEnv();

const getInt = (key, defaultVal) => {
  const value = parseInt(process.env[key], 10);
  return isNaN(value) ? defaultVal : value;
};

const getBool = (key, defaultVal = false) => {
  const value = process.env[key];
  if (value === undefined || value === '') return defaultVal;
  return value === 'true';
};

// Objeto de configuração que sempre lê os valores atuais de process.env
// usando getters para garantir valores dinâmicos
const config = {
  // Propriedades estáticas (não mudam)
  envPath: envPath,
  loadEnv: loadEnv,
  
  // Getter para tvheadend - sempre retorna valores atualizados
  get tvheadend() {
    return {
      url: process.env.TVHEADEND_URL || 'http://localhost:9981',
      user: process.env.TVHEADEND_USERNAME || '',
      pass: process.env.TVHEADEND_PASSWORD || ''
    };
  },
  
  // Getter para api
  get api() {
    return {
      priority: (process.env.API_PRIORITY_ORDER || 'plex,tvdb,tmdb,omdb').split(','),
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
  
  // Getter para output
  get output() {
    return {
      path: process.env.OUTPUT_FILE_PATH || './xmltv.xml',
      placeholderImage: process.env.PLACEHOLDER_IMAGE_URL || ''
    };
  },
  
  // Getter para processing
  get processing() {
    return {
      concurrency: getInt('CONCURRENCY_LIMIT', 1),
      scheduleHours: getInt('SCHEDULE_INTERVAL_HOURS', 12)
    };
  },
  
  // Getter para matching
  get matching() {
    return {
      algorithm: process.env.MATCHING_ALGORITHM || 'jaro_winkler',
      confidenceThreshold: getInt('CONFIDENCE_THRESHOLD', 85)
    };
  },
  
  // Getter para cache
  get cache() {
    return {
      enabled: getBool('CACHE_ENABLED', true),
      ttlHours: getInt('CACHE_TTL_HOURS', 24)
    };
  },
  
  // Getter para logging
  get logging() {
    return {
      level: process.env.LOG_LEVEL || 'info',
      file: process.env.LOG_FILE || '',
      debugUrls: getBool('DEBUG_URLS', false)
    };
  }
};

// Exportar o objeto config
module.exports = config;
