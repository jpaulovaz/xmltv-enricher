const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');
const { generateCacheKey } = require('../utils/helpers');

class CacheService {
  constructor(config) {
    this.enabled = config.cache.enabled;
    this.ttlMs = config.cache.ttlHours * 60 * 60 * 1000;

    const dataDir = path.join(process.cwd(), 'data');
    const fs = require('fs');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, 'cache_enricher.db');
    this.db = null;
    this.initPromise = Promise.resolve();

    if (this.enabled) {
      this.initPromise = this._initDb();
    }
  }

  _initDb() {
    return new Promise((resolve) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error(`Cache: Erro ao abrir banco SQLite: ${err.message}`);
          this.enabled = false;
          resolve();
        } else {
          this.db.serialize(() => {
            this.db.run(`
              CREATE TABLE IF NOT EXISTS cache (
                key TEXT PRIMARY KEY,
                data TEXT,
                timestamp INTEGER
              )
            `);

            this.db.run('CREATE INDEX IF NOT EXISTS idx_timestamp ON cache(timestamp)', (indexErr) => {
              if (indexErr) {
                logger.error(`Cache: Erro ao criar tabela/índice: ${indexErr.message}`);
              } else {
                logger.info(`Cache persistente conectado e pronto: ${this.dbPath}`);
              }
              resolve();
            });
          });
        }
      });
    });
  }

  async get(title, year, context = {}) {
    if (!this.enabled) return null;
    await this.initPromise;
    if (!this.db) return null;

    const key = generateCacheKey(title, year, context);

    return new Promise((resolve) => {
      this.db.get('SELECT data, timestamp FROM cache WHERE key = ?', [key], (err, row) => {
        if (err) {
          resolve(null);
          return;
        }

        if (!row) {
          resolve(null);
          return;
        }

        if (Date.now() - row.timestamp > this.ttlMs) {
          this.db.run('DELETE FROM cache WHERE key = ?', [key]);
          resolve(null);
          return;
        }

        try {
          resolve(JSON.parse(row.data));
        } catch (e) {
          resolve(null);
        }
      });
    });
  }

  async set(title, year, data, context = {}) {
    if (!this.enabled) return;
    await this.initPromise;
    if (!this.db) return;

    const key = generateCacheKey(title, year, context);
    const json = JSON.stringify(data);
    const now = Date.now();

    this.db.run(
      'INSERT OR REPLACE INTO cache (key, data, timestamp) VALUES (?, ?, ?)',
      [key, json, now],
      (err) => {
        if (err) logger.error(`Cache SET Error: ${err.message}`);
      }
    );
  }

  async cleanup() {
    if (!this.enabled) return;
    await this.initPromise;
    if (!this.db) return;

    const threshold = Date.now() - this.ttlMs;
    this.db.run('DELETE FROM cache WHERE timestamp < ?', [threshold], function (err) {
      if (!err && this.changes > 0) {
        logger.info(`Cache Cleanup: ${this.changes} itens expirados removidos.`);
      }
    });
  }
}

module.exports = CacheService;
