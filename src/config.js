require('dotenv').config();

const config = {
  // Tvheadend
  tvheadend: {
    url: process.env.TVHEADEND_URL || 'http://localhost:9981',
    username: process.env.TVHEADEND_USERNAME || '',
    password: process.env.TVHEADEND_PASSWORD || ''
  },

  // APIs
  apis: {
    plex: {
      url: process.env.PLEX_URL || 'http://localhost:32400',
      token: process.env.PLEX_TOKEN || '',
      enabled: !!process.env.PLEX_TOKEN
    },
    plexdb: {
      path: process.env.PLEX_DB_PATH || '/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db',
      enabled: process.env.PLEX_DB_ENABLED === 'true'
    },
    tvdb: {
      apiKey: process.env.TVDB_API_KEY || '',
      pin: process.env.TVDB_PIN || '',
      enabled: !!process.env.TVDB_API_KEY
    },
    tmdb: {
      apiKey: process.env.TMDB_API_KEY || '',
      enabled: !!process.env.TMDB_API_KEY
    },
    omdb: {
      apiKey: process.env.OMDB_API_KEY || '',
      enabled: !!process.env.OMDB_API_KEY
    }
  },

  // Agendamento
  schedule: {
    intervalHours: parseInt(process.env.SCHEDULE_INTERVAL_HOURS || '12', 10)
  },

  // Saída
  output: {
    filePath: process.env.OUTPUT_FILE_PATH || '/home/ubuntu/xmltv-enricher/output/xmltv.xml',
    placeholderImageUrl: process.env.PLACEHOLDER_IMAGE_URL || 'https://via.placeholder.com/342x513?text=No+Image'
  },

  // Confiança e Matching
  matching: {
    algorithm: process.env.MATCHING_ALGORITHM || 'jaro_winkler',
    confidenceThreshold: parseInt(process.env.CONFIDENCE_THRESHOLD || '85', 10)
  },

  // Cache
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    ttlHours: parseInt(process.env.CACHE_TTL_HOURS || '24', 10)
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || '/var/log/xmltv-enricher.log',
    debugUrls: process.env.DEBUG_URLS === 'true'
  },

  // Ordem de prioridade das APIs
  apiPriorityOrder: (process.env.API_PRIORITY_ORDER || 'plex,tvdb,tmdb,omdb').split(',').map(api => api.trim().toLowerCase()),

  // Ambiente
  env: process.env.NODE_ENV || 'production'
};

  // Validação básica
function validateConfig() {
  const enabledApis = [config.apis.plex.enabled, config.apis.plexdb.enabled, config.apis.tvdb.enabled, config.apis.tmdb.enabled, config.apis.omdb.enabled];
  
  if (!enabledApis.some(api => api)) {
    console.warn('⚠️  AVISO: Nenhuma API está configurada! Configure pelo menos uma chave de API no arquivo .env');
  }

  if (config.schedule.intervalHours < 1) {
    throw new Error('SCHEDULE_INTERVAL_HOURS deve ser >= 1');
  }

  // Validar ordem de prioridade das APIs
  const validApis = ['plex', 'plexdb', 'tvdb', 'tmdb', 'omdb'];
  const invalidApis = config.apiPriorityOrder.filter(api => !validApis.includes(api));
  if (invalidApis.length > 0) {
    throw new Error(`API_PRIORITY_ORDER contém APIs inválidas: ${invalidApis.join(', ')}. APIs válidas: ${validApis.join(', ')}`);
  }

  // Validar algoritmo de matching
  const validAlgorithms = ['levenshtein', 'jaro_winkler', 'cosine'];
  if (!validAlgorithms.includes(config.matching.algorithm)) {
    throw new Error(`MATCHING_ALGORITHM inválido: ${config.matching.algorithm}. Válidos: ${validAlgorithms.join(', ')}`);
  }

  // Validar threshold de confiança
  if (config.matching.confidenceThreshold < 0 || config.matching.confidenceThreshold > 100) {
    throw new Error('CONFIDENCE_THRESHOLD deve estar entre 0 e 100');
  }
}

validateConfig();

module.exports = config;
