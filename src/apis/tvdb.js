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

      return response.data.data || [];
    } catch (error) {
      if (error.response?.status === 429) {
        logger.warn('TVDb: Rate limit atingido, aguardando 5 segundos...');
        await sleep(5000);
        return this.search(query, type);
      }
      logger.error(`TVDb: Erro na busca (${query}) - ${error.message}`);
      return [];
    }
  }

  async getSeriesDetails(seriesId) {
    try {
      const token = await this.authenticate();

      // Remover prefixo "series-" se existir
      const cleanId = seriesId.toString().replace(/^series-/, '');

      const url = `${API_BASE}/series/${cleanId}/extended`;
      // 'meta: translations' ajuda a garantir nomes em outros idiomas,
      // mas o endpoint extended já traz o array de 'aliases' por padrão.
      const params = { meta: 'translations' };

      if (config.logging.debugUrls) {
        logger.debug(`TVDb: GET ${url}`);
      }

      const response = await axios.get(url, {
        params,
        headers: {
          Authorization: `Bearer ${token}`
        },
        timeout: 10000
      });

      return response.data.data || null;
    } catch (error) {
      if (error.response?.status === 429) {
        await sleep(5000);
        return this.getSeriesDetails(seriesId);
      }

      logger.error(`TVDb: Erro ao obter detalhes da série (${seriesId}) - ${error.message}`);
      return null;
    }
  }

  async enrichProgram(title, year = null) {
    try {
      await this.authenticate();

      // Busca inicial
      let searchResults = await this.search(title);

      if (!searchResults || searchResults.length === 0) {
        logger.debug(`TVDb: Nenhum resultado para "${title}"`);
        return null;
      }

      // Tenta encontrar o melhor match validando o ano
      let series = searchResults[0];

      if (year) {
        const matchWithYear = searchResults.find(s => {
          // TVDb v4 usa firstAired ou first_air_date dependendo do endpoint
          const dateStr = s.first_air_date || s.firstAired;
          if (!dateStr) return false;
          const seriesYear = new Date(dateStr).getFullYear();
          return Math.abs(seriesYear - year) <= 1;
        });

        if (matchWithYear) {
          series = matchWithYear;
        }
      }

      // Obter detalhes completos (incluindo aliases)
      const details = await this.getSeriesDetails(series.id);

      if (!details) return null;

      // --- MAPEAMENTO DOS ALIASES (AQUI ESTÁ A MÁGICA) ---
      // O TVDb retorna aliases no formato: [{ name: "Money Heist", language: "eng" }, ...]
      // O MatchingService espera: { titles: [{ title: "Money Heist" }, ...] }

      const aliases = details.aliases
        ? details.aliases.map(alias => ({ title: alias.name }))
        : [];

      // Garantir a data correta (API v4 usa firstAired)
      const firstAired = details.firstAired || details.first_air_date;

      return {
        source: 'tvdb',
        id: details.id,
        title: details.name,
        // TVDb geralmente tem 'originalName' no endpoint extended, senão usamos o name
        original_title: details.originalName || details.name,
        // Injetamos os aliases no formato que o MatchingService entende
        alternative_titles: { titles: aliases },
        description: details.overview,
        image: details.image,
        genres: details.genres?.map(g => g.name) || [],
        year: firstAired ? new Date(firstAired).getFullYear() : null,
        contentRating: details.contentRating,
        score: null,
        type: 'series'
      };
    } catch (error) {
      logger.error(`TVDb: Erro ao enriquecer "${title}" - ${error.message}`);
      return null;
    }
  }
}

module.exports = TVDbAPI;