const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const logger = require('../utils/logger');

class PlexDBAPI {
  constructor(dbPath) {
    this.originalDbPath = dbPath;
    this.tempDbPath = path.join(os.tmpdir(), `plex_${Date.now()}.db`);
    this.db = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      if (!fs.existsSync(this.originalDbPath)) {
        throw new Error(`Arquivo de banco Plex não encontrado: ${this.originalDbPath}`);
      }

      logger.info('PlexDB: Copiando banco de dados para TEMP (feito uma vez por execução)...');
      fs.copyFileSync(this.originalDbPath, this.tempDbPath);

      this.db = new sqlite3.Database(this.tempDbPath, sqlite3.OPEN_READONLY);
      this.initialized = true;
      logger.info('PlexDB: Banco carregado e pronto para consultas.');
    } catch (error) {
      logger.error(`PlexDB Init Error: ${error.message}`);
      this.initialized = false;
    }
  }

  async enrichProgram(title, year = null) {
    if (!this.initialized || !this.db) {
      await this.initialize();
      if (!this.db) return null;
    }

    return new Promise((resolve) => {
      const normalizedTitle = title.toLowerCase();
      const exactMatch = normalizedTitle;
      const fuzzyMatch = `%${title}%`;
      const yearValue = Number.isInteger(year) ? year : 0;

      const query = `
        SELECT
          title,
          year,
          tags_genre,
          summary,
          hash,
          metadata_type,
          CASE
            WHEN lower(title) = ? THEN 3
            WHEN lower(title) LIKE ? THEN 2
            ELSE 1
          END AS match_rank,
          CASE
            WHEN year IS NOT NULL AND ? > 0 THEN ABS(year - ?)
            ELSE 999
          END AS year_distance
        FROM metadata_items
        WHERE title LIKE ?
          AND library_section_id > 0
          AND metadata_type IN (1, 2)
        ORDER BY match_rank DESC, year_distance ASC, LENGTH(title) ASC
        LIMIT 1
      `;

      this.db.get(query, [exactMatch, `%${normalizedTitle}%`, yearValue, yearValue, fuzzyMatch], (err, row) => {
        if (err || !row) {
          resolve(null);
          return;
        }

        resolve(this._formatResult(row));
      });
    });
  }

  _formatResult(row) {
    return {
      source: 'plexdb',
      id: row.hash,
      title: row.title,
      description: row.summary,
      image: null,
      genres: row.tags_genre ? row.tags_genre.split('|') : [],
      year: row.year,
      score: null,
      contentRating: null,
      type: row.metadata_type === 2 ? 'series' : 'movie'
    };
  }

  shutdown() {
    if (this.db) {
      this.db.close(() => {
        try {
          if (fs.existsSync(this.tempDbPath)) {
            fs.unlinkSync(this.tempDbPath);
            logger.info('PlexDB: Arquivo temporário limpo com sucesso.');
          }
        } catch (e) {
          logger.error(`Erro ao limpar temp DB: ${e.message}`);
        }
      });
    }
  }
}

module.exports = PlexDBAPI;
