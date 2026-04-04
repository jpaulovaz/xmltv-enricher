const axios = require('axios');
const logger = require('../utils/logger');

class OMDbAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.name = 'omdb';
    this.baseUrl = 'http://www.omdbapi.com/';
  }

  async enrichProgram(title, year = null) {
    try {
      const params = {
        apikey: this.apiKey,
        t: title,
        plot: 'short'
      };
      if (year) params.y = year;

      const response = await axios.get(this.baseUrl, { params });
      const data = response.data;

      if (data.Response === 'False') {
        if (year) return this.enrichProgram(title, null);
        return null;
      }

      const genresArray = data.Genre && data.Genre !== 'N/A'
        ? data.Genre.split(',').map(g => g.trim())
        : [];

      return {
        source: 'omdb',
        id: data.imdbID,
        title: data.Title,
        description: data.Plot,
        image: data.Poster !== 'N/A' ? data.Poster : null,
        genres: genresArray,
        year: parseInt(data.Year, 10),
        score: data.imdbRating && data.imdbRating !== 'N/A' ? Number(data.imdbRating) : null,
        contentRating: data.Rated && data.Rated !== 'N/A' ? data.Rated : null,
        type: data.Type === 'series' ? 'series' : 'movie'
      };
    } catch (error) {
      logger.error(`OMDb: Erro ao enriquecer "${title}" - ${error.message}`);
      return null;
    }
  }
}

module.exports = OMDbAPI;
