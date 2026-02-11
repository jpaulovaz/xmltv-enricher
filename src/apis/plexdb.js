const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { extractCleanTitle, cleanSeriesInfo } = require('../utils/helpers');

class PlexDBAPI {
  constructor(dbPath) {
    this.name = 'plexdb';
    this.originalDbPath = dbPath;
    this.tempDbPath = path.join('/tmp', `plex_enricher_${Date.now()}.db`);
  }

  async enrichProgram(title, year = null) {
    if (!this.originalDbPath || !fs.existsSync(this.originalDbPath)) {
      return null;
    }

    let db = null;

    try {
      // 1. Copiar DB para temp para evitar lock
      fs.copyFileSync(this.originalDbPath, this.tempDbPath);

      // 2. Abrir conexão
      db = new sqlite3.Database(this.tempDbPath, sqlite3.OPEN_READONLY);

      // 3. Consultar
      const result = await this._queryDatabase(db, title, year);

      return result;

    } catch (error) {
      logger.error(`PlexDB: Erro ao consultar banco: ${error.message}`);
      return null;
    } finally {
      // 4. Fechar conexão e LIMPAR ARQUIVO TEMPORÁRIO (Essencial!)
      if (db) {
        db.close((err) => {
          if (err) logger.error(`PlexDB: Erro ao fechar banco: ${err.message}`);

          // Deleta o arquivo temporário após fechar a conexão
          try {
            if (fs.existsSync(this.tempDbPath)) {
              fs.unlinkSync(this.tempDbPath);
              // logger.debug('PlexDB: Arquivo temporário removido com sucesso.');
            }
          } catch (unlinkErr) {
            logger.error(`PlexDB: Falha ao deletar arquivo temporário: ${unlinkErr.message}`);
          }
        });
      } else {
        // Se a conexão nem abriu, tenta deletar mesmo assim
        try {
          if (fs.existsSync(this.tempDbPath)) {
            fs.unlinkSync(this.tempDbPath);
          }
        } catch (unlinkErr) { }
      }
    }
  }

  _queryDatabase(db, title, year) {
    return new Promise((resolve, reject) => {
      // Tenta buscar exato primeiro
      let query = `
        SELECT title, year, tags_genre, tags_star, summary, hash 
        FROM metadata_items 
        WHERE title LIKE ? 
        AND library_section_id > 0 
        ORDER BY year DESC LIMIT 1
      `;

      db.get(query, [`%${title}%`], (err, row) => {
        if (err) return reject(err);

        if (row) {
          resolve(this._formatResult(row));
        } else {
          resolve(null);
        }
      });
    });
  }

  _formatResult(row) {
    return {
      source: 'plexdb',
      id: row.hash,
      title: row.title,
      description: row.summary,
      image: null, // Plex local não fornece URL pública de imagem facilmente
      genres: row.tags_genre ? row.tags_genre.split('|') : [],
      year: row.year,
      rating: null,
      type: 'movie' // Simplificado, poderia checar metadata_type
    };
  }
}

module.exports = PlexDBAPI;