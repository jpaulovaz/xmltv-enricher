const logger = require('./utils/logger');
const XMLParser = require('./xmlParser');
const PlexDatabaseAPI = require('./apis/plexdb');
const PlexAPI = require('./apis/plex');
const TVDbAPI = require('./apis/tvdb');
const TMDbAPI = require('./apis/tmdb');
const OMDbAPI = require('./apis/omdb');
const MatchingService = require('./services/matchingService');
const CacheService = require('./services/cacheService');

class XMLTVEnricher {
  constructor(config) {
    this.config = config;
    this.xmlParser = new XMLParser();
    this.cacheService = new CacheService(config);
    this.matchingService = null;
    this.plexDbAPI = null;
  }

  /**
   * Inicializar enriquecedor (async)
   */
  async initialize() {
    await this.initializeAPIs();
  }

  /**
   * Inicializar clientes das APIs baseado na ordem de prioridade
   */
  async initializeAPIs() {
    const apiInstances = {
      plexdb: null,
      plex: null,
      tvdb: null,
      tmdb: null,
      omdb: null
    };

    // Inicializar todas as APIs disponíveis
    if (this.config.apis.plexdb.enabled) {
      const plexDbAPI = new PlexDatabaseAPI(this.config.apis.plexdb.path);
      const initialized = await plexDbAPI.initialize();
      if (initialized) {
        logger.info('✓ Plex Database inicializada (Principal - Gracenote)');
        apiInstances.plexdb = plexDbAPI;
        this.plexDbAPI = plexDbAPI;
      } else {
        logger.warn('⚠️  Plex Database não disponível, usando próxima API na fila');
      }
    }

    if (this.config.apis.plex.enabled) {
      const plexAPI = new PlexAPI(this.config.apis.plex.url, this.config.apis.plex.token);
      logger.info('✓ Plex API inicializada');
      apiInstances.plex = plexAPI;
    }

    if (this.config.apis.tvdb.enabled) {
      const tvdbAPI = new TVDbAPI(this.config.apis.tvdb.apiKey, this.config.apis.tvdb.pin);
      logger.info('✓ TVDb API inicializada');
      apiInstances.tvdb = tvdbAPI;
    }

    if (this.config.apis.tmdb.enabled) {
      const tmdbAPI = new TMDbAPI(this.config.apis.tmdb.apiKey);
      logger.info('✓ TMDb API inicializada');
      apiInstances.tmdb = tmdbAPI;
    }

    if (this.config.apis.omdb.enabled) {
      const omdbAPI = new OMDbAPI(this.config.apis.omdb.apiKey);
      logger.info('✓ OMDb API inicializada');
      apiInstances.omdb = omdbAPI;
    }

    // Ordenar APIs baseado na prioridade configurada
    const orderedApis = [];
    for (const apiName of this.config.apiPriorityOrder) {
      if (apiInstances[apiName]) {
        orderedApis.push(apiInstances[apiName]);
      }
    }

    // Log da ordem de prioridade
    const apiNames = this.config.apiPriorityOrder.filter(name => apiInstances[name]);
    logger.info(`Ordem de prioridade das APIs: ${apiNames.map(name => name.toUpperCase()).join(' → ')}`);

    // Criar MatchingService com APIs na ordem correta e config
    this.matchingService = new MatchingService(
      ...orderedApis,
      this.config,
      this.cacheService
    );
  }

  /**
   * Executar enriquecimento completo
   */
  async run() {
    try {
      logger.info('═══════════════════════════════════════════════════════════');
      logger.info('Iniciando enriquecimento de XMLTV');
      logger.info('═══════════════════════════════════════════════════════════');

      const startTime = Date.now();

      // 1. Baixar XML do Tvheadend
      logger.info('Etapa 1: Baixando XML do Tvheadend...');
      const xmlContent = await this.xmlParser.downloadFromTvheadend(
        this.config.tvheadend.url,
        this.config.tvheadend.username,
        this.config.tvheadend.password
      );

      logger.info(`✓ XML baixado com sucesso (${xmlContent.length} bytes)`);

      // 2. Parse do XML
      logger.info('Etapa 2: Fazendo parse do XML...');
      const parsedXml = await this.xmlParser.parse(xmlContent);
      
      if (!parsedXml || !parsedXml.tv) {
        throw new Error('XML parseado inválido: estrutura esperada não encontrada');
      }
      
      const programmes = parsedXml.tv.programme || [];

      logger.info(`Etapa 3: Enriquecendo programas...`);
      logger.info(`Total de programas a enriquecer: ${programmes.length}`);

      if (programmes.length === 0) {
        logger.warn('⚠️  Nenhum programa encontrado no XML do Tvheadend!');
      }

      // 3. Enriquecer programas
      const enrichedProgrammes = [];
      for (let i = 0; i < programmes.length; i++) {
        const programme = programmes[i];
        const enriched = await this.matchingService.enrichProgram(
          programme,
          this.config.output.placeholderImageUrl
        );

        enrichedProgrammes.push(enriched);

        // Log de progresso a cada 1000 programas
        if ((i + 1) % 1000 === 0) {
          logger.info(`Progresso: ${i + 1}/${programmes.length} programas processados`);
        }
      }

      // 4. Gerar novo XML
      logger.info('Etapa 4: Gerando novo XML enriquecido...');
      parsedXml.tv.programme = enrichedProgrammes;
      const enrichedXml = this.xmlParser.build(parsedXml);

      // 5. Salvar arquivo
      logger.info('Etapa 5: Salvando arquivo...');
      await this.xmlParser.saveToFile(enrichedXml, this.config.output.filePath);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.info('═══════════════════════════════════════════════════════════');
      logger.info(`✓ Enriquecimento concluído com sucesso em ${duration}s`);
      logger.info(`✓ Arquivo salvo em: ${this.config.output.filePath}`);
      logger.info('═══════════════════════════════════════════════════════════');
    } catch (error) {
      logger.error(`Erro durante enriquecimento: ${error.message}`);
      throw error;
    }
  }
}

module.exports = XMLTVEnricher;
