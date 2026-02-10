const logger = require('../utils/logger');
const { generateCacheKey } = require('../utils/helpers');

class CacheService {
  constructor(config) {
    this.enabled = config.cache.enabled;
    this.ttlMs = config.cache.ttlHours * 60 * 60 * 1000;
    this.cache = new Map();
  }

  /**
   * Obter valor do cache
   */
  get(title, year) {
    if (!this.enabled) return null;

    const key = generateCacheKey(title, year);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Verificar expiração
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    logger.debug(`Cache HIT: ${key}`);
    return entry.data;
  }

  /**
   * Armazenar valor no cache
   */
  set(title, year, data) {
    if (!this.enabled) return;

    const key = generateCacheKey(title, year);
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });

    logger.debug(`Cache SET: ${key}`);
  }

  /**
   * Limpar cache expirado
   */
  cleanup() {
    if (!this.enabled) return;

    let cleaned = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cache cleanup: ${cleaned} entradas removidas`);
    }
  }

  /**
   * Limpar todo o cache
   */
  clear() {
    this.cache.clear();
    logger.info('Cache limpo completamente');
  }

  /**
   * Obter estatísticas
   */
  getStats() {
    return {
      size: this.cache.size,
      enabled: this.enabled,
      ttlHours: this.ttlMs / (60 * 60 * 1000)
    };
  }
}

module.exports = CacheService;
