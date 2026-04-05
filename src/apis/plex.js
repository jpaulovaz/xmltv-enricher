const axios = require('axios');
const logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

class PlexAPI {
  constructor(plexUrl, plexToken) {
    this.plexUrl = plexUrl;
    this.plexToken = plexToken;
    this.client = axios.create({
      baseURL: plexUrl,
      headers: {
        'X-Plex-Token': plexToken,
        'Accept': 'application/json'
      },
      timeout: 10000
    });
  }

  /**
   * Verificar conexão com Plex
   */
  async testConnection() {
    try {
      const response = await this.client.get('/');
      logger.info('Plex: Conexão bem-sucedida');
      return true;
    } catch (error) {
      logger.error(`Plex: Erro na conexão - ${error.message}`);
      return false;
    }
  }

  /**
   * Obter canais de TV do Plex
   */
  async getChannels() {
    try {
      const response = await this.client.get('/livetv/channels');
      return response.data?.MediaContainer?.Metadata || [];
    } catch (error) {
      logger.error(`Plex: Erro ao obter canais - ${error.message}`);
      return [];
    }
  }

  /**
   * Obter programação (lineup) do Plex
   */
  async getLineup() {
    try {
      const response = await this.client.get('/livetv/lineup');
      return response.data?.MediaContainer?.Metadata || [];
    } catch (error) {
      logger.error(`Plex: Erro ao obter lineup - ${error.message}`);
      return [];
    }
  }

  /**
   * Buscar programa pelo nome na base do Plex
   */
  async searchProgram(title, year = null) {
    try {
      // Tentar buscar na biblioteca de mídia do Plex
      const params = {
        query: title,
        includeExternalMedia: 1
      };

      const response = await this.client.get('/search', { params });
      const results = response.data?.MediaContainer?.Metadata || [];

      if (results.length === 0) {
        logger.debug(`Plex: Nenhum resultado para "${title}"`);
        return null;
      }

      // Filtrar por tipo e ano se fornecido
      let filtered = results.filter(r => 
        r.type === 'movie' || r.type === 'show' || r.type === 'episode'
      );

      if (year && filtered.length > 0) {
        // Tentar encontrar por ano
        filtered = filtered.filter(r => {
          const releaseYear = r.year || (r.addedAt ? new Date(r.addedAt * 1000).getFullYear() : null);
          return releaseYear === year || Math.abs(releaseYear - year) <= 1;
        });
      }

      if (filtered.length === 0) {
        filtered = results;
      }

      return filtered[0];
    } catch (error) {
      if (error.response?.status === 429) {
        logger.warn('Plex: Rate limit atingido, aguardando 5 segundos...');
        await sleep(5000);
        return this.searchProgram(title, year);
      }
      logger.error(`Plex: Erro na busca (${title}) - ${error.message}`);
      return null;
    }
  }

  /**
   * Obter detalhes de um programa
   */
  async getProgramDetails(ratingKey) {
    try {
      const response = await this.client.get(`/library/metadata/${ratingKey}`);
      return response.data?.MediaContainer?.Metadata?.[0] || null;
    } catch (error) {
      logger.error(`Plex: Erro ao obter detalhes (${ratingKey}) - ${error.message}`);
      return null;
    }
  }

  /**
   * Enriquecer um programa com dados do Plex
   */
  async enrichProgram(title, year = null) {
    try {
      // Buscar programa no Plex
      const result = await this.searchProgram(title, year);

      if (!result) {
        logger.debug(`Plex: Nenhum resultado para "${title}"`);
        return null;
      }

      // Obter detalhes completos se necessário
      let details = result;
      if (result.ratingKey && !result.summary) {
        details = await this.getProgramDetails(result.ratingKey);
      }

      if (!details) {
        return null;
      }

      // Extrair informações
      const thumb = details.thumb || details.art;
      const genres = details.Genre?.map(g => g.tag) || [];
      const releaseYear = details.year || (details.addedAt ? new Date(details.addedAt * 1000).getFullYear() : null);
      const contentRating = details.contentRating;
      const type = details.type === 'show' ? 'series' : details.type === 'movie' ? 'movie' : 'unknown';

      // Construir URL completa da imagem se necessário
      let imageUrl = thumb;
      if (thumb && !thumb.startsWith('http')) {
        imageUrl = `${this.plexUrl}${thumb}?X-Plex-Token=${this.plexToken}`;
      }

      return {
        source: 'plex',
        id: details.ratingKey,
        title: details.title,
        description: details.summary,
        image: imageUrl,
        genres,
        year: releaseYear,
        rating: contentRating,
        type
      };
    } catch (error) {
      logger.error(`Plex: Erro ao enriquecer programa "${title}" - ${error.message}`);
      return null;
    }
  }
}

module.exports = PlexAPI;
