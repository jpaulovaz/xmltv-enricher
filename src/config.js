const path = require('path');

// Carregar .env do diretório raiz do projeto (não de process.cwd())
const envPath = path.resolve(__dirname, '..', '.env');
require('dotenv').config({ path: envPath });

console.log(`[Config] Carregando .env de: ${envPath}`);
console.log(`[Config] TVHEADEND_URL: ${process.env.TVHEADEND_URL || 'não definido'}`);

const getInt = (key, defaultVal) => {
  const value = parseInt(process.env[key], 10);
  return isNaN(value) ? defaultVal : value;
};

module.exports = {
  tvheadend: {
    url: process.env.TVHEADEND_URL || 'http://localhost:9981',
    user: process.env.TVHEADEND_USERNAME,
    pass: process.env.TVHEADEND_PASSWORD
  },
  api: {
    priority: (process.env.API_PRIORITY_ORDER || 'plex,tvdb,tmdb,omdb').split(','),
    tmdb: { key: process.env.TMDB_API_KEY },
    tvdb: { key: process.env.TVDB_API_KEY, pin: process.env.TVDB_PIN },
    omdb: { key: process.env.OMDB_API_KEY },
    imdb: { enabled: process.env.IMDB_ENABLED === 'true' },
    plex: {
      url: process.env.PLEX_URL || 'http://localhost:32400',
      token: process.env.PLEX_TOKEN,
      dbEnabled: process.env.PLEX_DB_ENABLED === 'true',
      dbPath: process.env.PLEX_DB_PATH
    }
  },
  output: {
    path: process.env.OUTPUT_FILE_PATH || './xmltv.xml',
    placeholderImage: process.env.PLACEHOLDER_IMAGE_URL
  },
  processing: {
    // AQUI ESTÁ O SEGREDO DO PARALELISMO
    concurrency: getInt('CONCURRENCY_LIMIT', 1),
    scheduleHours: getInt('SCHEDULE_INTERVAL_HOURS', 12)
  },
  matching: {
    algorithm: process.env.MATCHING_ALGORITHM || 'jaro_winkler',
    confidenceThreshold: getInt('CONFIDENCE_THRESHOLD', 85)
  },
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    ttlHours: getInt('CACHE_TTL_HOURS', 24)
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE,
    debugUrls: process.env.DEBUG_URLS === 'true'
  }
};