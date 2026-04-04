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
    this.language = config.api.language || 'pt-BR';
  }

  async getGenres() {
    try {
      if (this.genreCache) return this.genreCache;

      const moviesUrl = `${API_BASE}/genre/movie/list`;
      const tvUrl = `${API_BASE}/genre/tv/list`;

      const [moviesResponse, tvResponse] = await Promise.all([
        axios.get(moviesUrl, { params: { api_key: this.apiKey }, timeout: 10000 }),
        axios.get(tvUrl, { params: { api_key: this.apiKey }, timeout: 10000 })
      ]);

      const allGenres = [...moviesResponse.data.genres, ...tvResponse.data.genres];
      this.genreCache = {};
      allGenres.forEach(g => { this.genreCache[g.id] = g.name; });

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
        language: this.language,
        include_adult: false
      };

      if (year) params.year = year;

      const url = `${API_BASE}/search/${type}`;
      let response = await axios.get(url, { params, timeout: 10000 });

      if (response.data.results?.length === 0 && year) {
        logger.debug(`TMDb: Nenhum resultado com ano ${year} para "${query}". Tentando sem o ano...`);
        delete params.year;
        response = await axios.get(url, { params, timeout: 10000 });
      }

      return response.data.results || [];
    } catch (error) {
      if (error.response?.status === 429) {
        await sleep(5000);
        return this.search(query, type, year);
      }
      logger.error(`TMDb: Erro na busca (${query}) - ${error.message}`);
      return [];
    }
  }

  async enrichById(id, type = 'movie') {
    try {
      const details = type === 'movie'
        ? await this.getMovieDetails(id)
        : await this.getTVDetails(id);

      if (!details) return null;

      return {
        title: details.title || details.name,
        original_title: details.original_title || details.original_name,
        year: (details.release_date || details.first_air_date || '').split('-')[0],
        image: details.poster_path ? `${IMAGE_BASE}${details.poster_path}` : null,
        description: details.overview,
        score: details.vote_average,
        genres: details.genres ? details.genres.map(g => g.name) : [],
        source: 'tmdb',
        type,
        contentRating: null
      };
    } catch (error) {
      logger.error(`[TMDb] Erro ao buscar por ID ${id}: ${error.message}`);
      return null;
    }
  }

  async getMovieDetails(movieId) {
    try {
      const url = `${API_BASE}/movie/${movieId}`;
      const response = await axios.get(url, {
        params: {
          api_key: this.apiKey,
          language: this.language,
          append_to_response: 'alternative_titles'
        },
        timeout: 10000
      });
      return response.data || null;
    } catch (error) {
      if (error.response?.status === 429) {
        await sleep(5000);
        return this.getMovieDetails(movieId);
      }
      return null;
    }
  }

  async getTVDetails(tvId) {
    try {
      const url = `${API_BASE}/tv/${tvId}`;
      const response = await axios.get(url, {
        params: {
          api_key: this.apiKey,
          language: this.language,
          append_to_response: 'alternative_titles'
        },
        timeout: 10000
      });
      return response.data || null;
    } catch (error) {
      if (error.response?.status === 429) {
        await sleep(5000);
        return this.getTVDetails(tvId);
      }
      return null;
    }
  }

  async enrichProgram(title, year = null) {
    try {
      const searchResults = await this.search(title, 'multi', year);
      const filtered = searchResults?.filter(r => r.media_type === 'movie' || r.media_type === 'tv');

      if (!filtered || filtered.length === 0) return null;

      const result = filtered[0];
      let details = null;
      let type = 'unknown';

      if (result.media_type === 'movie') {
        details = await this.getMovieDetails(result.id);
        type = 'movie';
      } else if (result.media_type === 'tv') {
        details = await this.getTVDetails(result.id);
        type = 'series';
      }

      if (!details) return null;

      const genres = details.genres?.map(g => g.name) || [];
      const releaseDate = details.release_date || details.first_air_date;

      return {
        source: 'tmdb',
        id: details.id,
        title: details.title || details.name,
        original_title: details.original_title || details.original_name,
        alternative_titles: details.alternative_titles,
        description: details.overview,
        image: details.poster_path ? `${IMAGE_BASE}${details.poster_path}` : null,
        genres,
        year: releaseDate ? new Date(releaseDate).getFullYear() : null,
        score: details.vote_average,
        type,
        contentRating: null
      };
    } catch (error) {
      logger.error(`TMDb: Erro ao enriquecer programa "${title}" - ${error.message}`);
      return null;
    }
  }
}

module.exports = TMDbAPI;
