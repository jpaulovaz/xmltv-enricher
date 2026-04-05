const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class PlexDBAPI {
  constructor(dbPath) {
    this.name = 'plexdb';
    this.source = 'plexdb';
    this.originalDbPath = dbPath;
    // Cria um nome único para esta execução
    this.tempDbPath = path.join('/tmp', `plex_enricher_${Date.now()}.db`);
    this.db = null;
    this.initialized = false;
  }

  // FASE 1: Preparação (Chamado no início do script)
  async initialize() {
    if (this.initialized) return;

    try {
      if (!fs.existsSync(this.originalDbPath)) {
        throw new Error(`Arquivo de banco Plex não encontrado: ${this.originalDbPath}`);
      }

      logger.info(`PlexDB: Copiando banco de dados para TEMP (Isso é feito 1 vez)...`);
      // A cópia pesada acontece AQUI
      fs.copyFileSync(this.originalDbPath, this.tempDbPath);

      // Abre a conexão persistente
      this.db = new sqlite3.Database(this.tempDbPath, sqlite3.OPEN_READONLY);
      this.initialized = true;
      logger.info('PlexDB: Banco carregado e pronto para consultas ultrarrápidas.');

    } catch (error) {
      logger.error(`PlexDB Init Error: ${error.message}`);
      this.initialized = false;
    }
  }

  // FASE 2: Consulta (Chamado milhares de vezes)
  async enrichProgram(title, year = null) {
    // Se por acaso não inicializou, tenta agora (fallback)
    if (!this.initialized || !this.db) {
      await this.initialize();
      if (!this.db) return null;
    }

    return new Promise((resolve, reject) => {
      // Query otimizada para pegar apenas Filmes(1) e Séries(2)
      const query = `
        SELECT title, year, tags_genre, summary, hash
        FROM metadata_items
        WHERE title LIKE ?
        AND library_section_id > 0
        AND metadata_type IN (1, 2)
        ORDER BY year DESC LIMIT 1
      `;

      this.db.get(query, [`%${title}%`], (err, row) => {
        if (err) {
          resolve(null);
        } else if (row) {
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
      image: null,
      genres: row.tags_genre ? row.tags_genre.split('|') : [],
      year: row.year,
      rating: null,
      type: 'movie'
    };
  }

  // FASE 3: Limpeza (Chamado no final do script)
  shutdown() {
    if (this.db) {
      this.db.close((err) => {
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