const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
const { sleep } = require('../utils/helpers');

const API_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

class TMDbAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.genreCache = null;
  }

  async getGenres() {
    try {
      if (this.genreCache) {
        return this.genreCache;
      }

      const moviesUrl = `${API_BASE}/genre/movie/list`;
      const tvUrl = `${API_BASE}/genre/tv/list`;

      if (config.logging.debugUrls) {
        logger.debug(`TMDb: GET ${moviesUrl}`);
        logger.debug(`TMDb: GET ${tvUrl}`);
      }

      // Obter gêneros de filmes
      const moviesResponse = await axios.get(moviesUrl, {
        params: { api_key: this.apiKey },
        timeout: 10000
      });

      // Obter gêneros de séries
      const tvResponse = await axios.get(tvUrl, {
        params: { api_key: this.apiKey },
        timeout: 10000
      });

      // Combinar e criar mapa
      const allGenres = [...moviesResponse.data.genres, ...tvResponse.data.genres];
      this.genreCache = {};
      allGenres.forEach(g => {
        this.genreCache[g.id] = g.name;
      });

      return this.genreCache;
    } catch (error) {
      logger.error(`TMDb: Erro ao obter gêneros - ${error.message}`);
      return {};
    }
  }

  async search(query, type = 'multi', year = null) {
    try {
      const params = {
        api_key: this.apiKey,
        query,
        language: 'pt-BR', // Vital para canais brasileiros
        include_adult: false
      };

      if (year) {
        params.year = year;
      }

      const url = `${API_BASE}/search/${type}`;

      if (config.logging.debugUrls) {
        logger.debug(`TMDb: GET ${url}`);
        logger.debug(`TMDb: Parâmetros: ${JSON.stringify(params)}`);
      }

      let response = await axios.get(url, {
        params,
        timeout: 10000
      });

      // --- LÓGICA DE PERSISTÊNCIA ---
      // Se não houver resultados com o ano, tentamos novamente SEM o ano
      if (response.data.results?.length === 0 && year) {
        logger.debug(`TMDb: Nenhum resultado com ano ${year} para "${query}". Tentando sem o ano...`);
        delete params.year;
        response = await axios.get(url, { params, timeout: 10000 });
      }

      if (config.logging.debugUrls) {
        logger.debug(`TMDb: Resposta da busca: ${response.data.results?.length || 0} resultados`);
      }

      return response.data.results || [];

    } catch (error) {
      // Mantém o tratamento de Rate Limit (429) que é importante
      if (error.response?.status === 429) {
        logger.warn('TMDb: Rate limit atingido, aguardando 5 segundos...');
        await sleep(5000);
        return this.search(query, type, year);
      }

      logger.error(`TMDb: Erro na busca (${query}) - ${error.message}`);
      return [];
    }
  }

  async getMovieDetails(movieId) {
    try {
      const url = `${API_BASE}/movie/${movieId}`;

      if (config.logging.debugUrls) {
        logger.debug(`TMDb: GET ${url}`);
        logger.debug(`TMDb: ID do filme: ${movieId}`);
      }

      const response = await axios.get(url, {
        params: { api_key: this.apiKey },
        timeout: 10000
      });

      if (config.logging.debugUrls) {
        logger.debug(`TMDb: Detalhes obtidos com sucesso para filme ${movieId}`);
      }

      return response.data || null;
    } catch (error) {
      if (error.response?.status === 429) {
        logger.warn('TMDb: Rate limit atingido, aguardando 5 segundos...');
        await sleep(5000);
        return this.getMovieDetails(movieId);
      }
      logger.error(`TMDb: Erro ao obter detalhes do filme (${movieId}) - ${error.message}`);
      if (config.logging.debugUrls && error.response) {
        logger.debug(`TMDb: URL: ${API_BASE}/movie/${movieId}`);
        logger.debug(`TMDb: Status: ${error.response.status}`);
      }
      return null;
    }
  }

  async getTVDetails(tvId) {
    try {
      const url = `${API_BASE}/tv/${tvId}`;

      if (config.logging.debugUrls) {
        logger.debug(`TMDb: GET ${url}`);
        logger.debug(`TMDb: ID da série: ${tvId}`);
      }

      const response = await axios.get(url, {
        params: { api_key: this.apiKey },
        timeout: 10000
      });

      if (config.logging.debugUrls) {
        logger.debug(`TMDb: Detalhes obtidos com sucesso para série ${tvId}`);
      }

      return response.data || null;
    } catch (error) {
      if (error.response?.status === 429) {
        logger.warn('TMDb: Rate limit atingido, aguardando 5 segundos...');
        await sleep(5000);
        return this.getTVDetails(tvId);
      }
      logger.error(`TMDb: Erro ao obter detalhes da série (${tvId}) - ${error.message}`);
      if (config.logging.debugUrls && error.response) {
        logger.debug(`TMDb: URL: ${API_BASE}/tv/${tvId}`);
        logger.debug(`TMDb: Status: ${error.response.status}`);
      }
      return null;
    }
  }

  async enrichProgram(title, year = null) {
    try {
      // Buscar (filme ou série)
      const searchResults = await this.search(title, 'multi', year);

      if (searchResults.length === 0) {
        logger.debug(`TMDb: Nenhum resultado para "${title}"`);
        return null;
      }

      // Filtrar apenas filmes e séries
      const filtered = searchResults.filter(r => r.media_type === 'movie' || r.media_type === 'tv');

      if (filtered.length === 0) {
        return null;
      }

      const result = filtered[0];

      if (config.logging.debugUrls) {
        logger.debug(`TMDb: Primeiro resultado encontrado: "${result.title || result.name}" (Tipo: ${result.media_type}, ID: ${result.id})`);
      }

      let details = null;
      let type = 'unknown';

      if (result.media_type === 'movie') {
        details = await this.getMovieDetails(result.id);
        type = 'movie';
      } else if (result.media_type === 'tv') {
        details = await this.getTVDetails(result.id);
        type = 'series';
      }

      if (!details || !details.poster_path) {
        return null;
      }

      // Obter mapa de gêneros
      const genreMap = await this.getGenres();
      const genres = details.genres?.map(g => g.name) || [];

      const releaseDate = result.media_type === 'movie'
        ? details.release_date
        : details.first_air_date;

      return {
        source: 'tmdb',
        id: details.id,
        title: details.name || details.title,
        description: details.overview,
        image: `${IMAGE_BASE}${details.poster_path}`,
        genres,
        year: releaseDate ? new Date(releaseDate).getFullYear() : null,
        rating: null, // TMDb não fornece classificação etária diretamente
        type
      };
    } catch (error) {
      logger.error(`TMDb: Erro ao enriquecer programa "${title}" - ${error.message}`);
      return null;
    }
  }
}

module.exports = TMDbAPI;
