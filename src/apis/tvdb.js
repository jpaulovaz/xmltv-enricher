const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
const { sleep } = require('../utils/helpers');

const API_BASE = 'https://api4.thetvdb.com/v4';

class TVDbAPI {
  constructor(apiKey, pin = '') {
    this.apiKey = apiKey;
    this.pin = pin;
    this.token = null;
    this.tokenExpiry = null;
  }

  async authenticate() {
    try {
      if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
        return this.token;
      }

      const payload = { apikey: this.apiKey };
      if (this.pin) {
        payload.pin = this.pin;
      }

      const url = `${API_BASE}/login`;
      if (config.logging.debugUrls) {
        logger.debug(`TVDb: POST ${url}`);
        logger.debug(`TVDb: Payload: ${JSON.stringify(payload)}`);
      }

      const response = await axios.post(url, payload, {
        timeout: 10000
      });

      this.token = response.data.data.token;
      // Token válido por 1 mês, renovar com 1 semana de antecedência
      this.tokenExpiry = new Date(Date.now() + 23 * 24 * 60 * 60 * 1000);

      logger.info('TVDb: Autenticação bem-sucedida');
      return this.token;
    } catch (error) {
      logger.error(`TVDb: Erro na autenticação - ${error.message}`);
      throw error;
    }
  }

  async search(query, type = 'series') {
    try {
      const token = await this.authenticate();

      const url = `${API_BASE}/search`;
      const params = { query, type };

      if (config.logging.debugUrls) {
        logger.debug(`TVDb: GET ${url}`);
        logger.debug(`TVDb: Parâmetros: ${JSON.stringify(params)}`);
      }

      const response = await axios.get(url, {
        params,
        headers: {
          Authorization: `Bearer ${token}`
        },
        timeout: 10000
      });

      if (config.logging.debugUrls) {
        logger.debug(`TVDb: Resposta da busca: ${response.data.data?.length || 0} resultados`);
      }

      return response.data.data || [];
    } catch (error) {
      if (error.response?.status === 429) {
        logger.warn('TVDb: Rate limit atingido, aguardando 5 segundos...');
        await sleep(5000);
        return this.search(query, type);
      }
      logger.error(`TVDb: Erro na busca (${query}) - ${error.message}`);
      if (config.logging.debugUrls && error.response) {
        logger.debug(`TVDb: Status: ${error.response.status}`);
        logger.debug(`TVDb: Resposta de erro: ${JSON.stringify(error.response.data)}`);
      }
      return [];
    }
  }

  async getSeriesDetails(seriesId) {
    try {
      const token = await this.authenticate();

      // Remover prefixo "series-" se existir (vem do PlexDB)
      const cleanId = seriesId.toString().replace(/^series-/, '');

      const url = `${API_BASE}/series/${cleanId}/extended`;
      const params = { meta: 'translations' };

      if (config.logging.debugUrls) {
        logger.debug(`TVDb: GET ${url}`);
        logger.debug(`TVDb: Parâmetros: ${JSON.stringify(params)}`);
        logger.debug(`TVDb: ID da série: ${seriesId}`);
      }

      const response = await axios.get(url, {
        params,
        headers: {
          Authorization: `Bearer ${token}`
        },
        timeout: 10000
      });

      if (config.logging.debugUrls) {
        logger.debug(`TVDb: Detalhes obtidos com sucesso para série ${seriesId}`);
      }

      return response.data.data || null;
    } catch (error) {
      if (error.response?.status === 429) {
        logger.warn('TVDb: Rate limit atingido, aguardando 5 segundos...');
        await sleep(5000);
        return this.getSeriesDetails(seriesId);
      }

      logger.error(`TVDb: Erro ao obter detalhes da série (${seriesId}) - ${error.message}`);

      if (config.logging.debugUrls) {
        logger.debug(`TVDb: URL: ${API_BASE}/series/${seriesId}/extended`);
        logger.debug(`TVDb: Status do erro: ${error.response?.status}`);
        logger.debug(`TVDb: Dados do erro: ${JSON.stringify(error.response?.data)}`);
      }

      return null;
    }
  }

  async enrichProgram(title, year = null) {
    try {
      await this.authenticate();

      // Busca inicial
      let searchResults = await this.search(title);

      if (searchResults.length === 0) {
        logger.debug(`TVDb: Nenhum resultado para "${title}"`);
        return null;
      }

      // Tenta encontrar o melhor match validando o ano
      let series = searchResults[0];

      if (year) {
        // Busca um resultado que bata com o ano (tolerância de 1 ano)
        const matchWithYear = searchResults.find(s => {
          if (!s.first_air_date) return false;
          const seriesYear = new Date(s.first_air_date).getFullYear();
          return Math.abs(seriesYear - year) <= 1;
        });

        if (matchWithYear) {
          series = matchWithYear;
        } else {
          logger.debug(`TVDb: Nenhum resultado com ano próximo a ${year} para "${title}". Usando o primeiro resultado da busca global.`);
          // Aqui mantemos o 'series' como o primeiro resultado da busca geral (persistência)
        }
      }

      // Obter detalhes completos
      const details = await this.getSeriesDetails(series.id);

      if (!details) return null;

      return {
        source: 'tvdb',
        id: details.id,
        title: details.name,
        description: details.overview,
        image: details.image,
        genres: details.genres?.map(g => g.name) || [],
        year: details.first_air_date ? new Date(details.first_air_date).getFullYear() : null,
        rating: details.contentRating,
        type: 'series'
      };
    } catch (error) {
      logger.error(`TVDb: Erro ao enriquecer "${title}" - ${error.message}`);
      return null;
    }
  }
}

module.exports = TVDbAPI;
