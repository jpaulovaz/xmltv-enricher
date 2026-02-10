const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

class PlexDatabaseAPI {
  constructor(plexDbPath) {
    this.plexDbPath = plexDbPath;
    this.tempDbPath = path.join('/tmp', `plex_enricher_${Date.now()}.db`);
    this.db = null;
  }

  /**
   * Copiar banco de dados do Plex para um local temporário
   * Isso evita problemas de acesso enquanto o Plex está rodando
   */
  async copyDatabase() {
    try {
      // Verificar se o arquivo existe
      if (!fs.existsSync(this.plexDbPath)) {
        logger.error(`Banco de dados do Plex não encontrado em: ${this.plexDbPath}`);
        return false;
      }

      // Tentar copiar com permissões elevadas se necessário
      try {
        fs.copyFileSync(this.plexDbPath, this.tempDbPath);
      } catch (err) {
        // Se falhar, tentar com sudo
        logger.warn('Tentando copiar com sudo...');
        execSync(`sudo cp "${this.plexDbPath}" "${this.tempDbPath}"`);
        execSync(`sudo chmod 644 "${this.tempDbPath}"`);
      }

      logger.info(`✓ Banco de dados copiado para: ${this.tempDbPath}`);
      return true;
    } catch (error) {
      logger.error(`Erro ao copiar banco de dados: ${error.message}`);
      return false;
    }
  }

  /**
   * Conectar ao banco de dados temporário
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.tempDbPath, (err) => {
        if (err) {
          logger.error(`Erro ao conectar ao banco: ${err.message}`);
          reject(err);
        } else {
          logger.info('✓ Conectado ao banco de dados do Plex');
          resolve();
        }
      });
    });
  }

  /**
   * Executar query no banco
   */
  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          logger.error(`Erro na query: ${err.message}`);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Buscar programa no banco de dados do Plex
   */
  async searchProgram(title, year = null) {
    try {
      if (!this.db) {
        logger.warn('Banco de dados não conectado');
        return null;
      }

      // Query para buscar na tabela metadata_items
      // metadata_items contém: título, descrição, imagem, gêneros, ano, classificação
      let sql = `
        SELECT 
          mi.id,
          mi.title,
          mi.year,
          mi.content_rating,
          mi.duration,
          mi.metadata_type,
          mi.summary,
          mi.user_thumb_url,
          mi.user_art_url,
          mi.tags_genre
        FROM metadata_items mi
        WHERE mi.title LIKE ? 
        AND mi.deleted_at IS NULL
        LIMIT 5
      `;

      const params = [`%${title}%`];

      const results = await this.query(sql, params);

      if (results.length === 0) {
        logger.debug(`PlexDB: Nenhum resultado para "${title}"`);
        return null;
      }

      // Se houver ano, tentar filtrar
      let filtered = results;
      if (year && results.length > 0) {
        filtered = results.filter(r => {
          const resultYear = r.year;
          return resultYear === year || (resultYear && Math.abs(resultYear - year) <= 1);
        });
      }

      if (filtered.length === 0) {
        filtered = results;
      }

      return filtered[0];
    } catch (error) {
      logger.error(`PlexDB: Erro na busca (${title}) - ${error.message}`);
      return null;
    }
  }

  /**
   * Extrair gêneros de tags_genre
   */
  parseGenres(tagsGenre) {
    try {
      if (!tagsGenre) return [];
      
      // tags_genre é uma string separada por vírgula ou outro delimitador
      // Tentar parsear como JSON primeiro
      try {
        const parsed = JSON.parse(tagsGenre);
        if (Array.isArray(parsed)) {
          return parsed.map(g => g.tag || g);
        }
      } catch (e) {
        // Se não for JSON, tentar separar por vírgula
        return tagsGenre.split(',').map(g => g.trim()).filter(g => g);
      }
    } catch (error) {
      logger.debug(`PlexDB: Erro ao parsear gêneros - ${error.message}`);
      return [];
    }
  }

  /**
   * Enriquecer um programa com dados do banco do Plex
   */
  async enrichProgram(title, year = null) {
    try {
      const result = await this.searchProgram(title, year);

      if (!result) {
        logger.debug(`PlexDB: Nenhum resultado para "${title}"`);
        return null;
      }

      // Extrair gêneros
      const genres = this.parseGenres(result.tags_genre);

      // Usar URL da imagem se disponível
      let imageUrl = result.user_thumb_url || result.user_art_url;
      
      // Se for URL relativa do Plex, não usar (não é acessível externamente)
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = null;
      }

      return {
        source: 'plexdb',
        id: result.id,
        title: result.title,
        description: result.summary,
        image: imageUrl,
        genres,
        year: result.year,
        rating: result.content_rating,
        type: this.getMediaType(result.metadata_type),
        duration: result.duration
      };
    } catch (error) {
      logger.error(`PlexDB: Erro ao enriquecer programa "${title}" - ${error.message}`);
      return null;
    }
  }

  /**
   * Converter metadata_type para tipo de mídia
   */
  getMediaType(metadataType) {
    // metadata_type: 1=movie, 2=show, 3=season, 4=episode, 8=artist, 9=album, 10=track
    const typeMap = {
      1: 'movie',
      2: 'series',
      3: 'series',
      4: 'episode',
      8: 'music',
      9: 'music',
      10: 'music'
    };
    return typeMap[metadataType] || 'unknown';
  }

  /**
   * Desconectar do banco de dados
   */
  async disconnect() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            logger.error(`Erro ao desconectar: ${err.message}`);
          } else {
            logger.info('✓ Desconectado do banco de dados');
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Limpar arquivo temporário
   */
  async cleanup() {
    try {
      if (fs.existsSync(this.tempDbPath)) {
        fs.unlinkSync(this.tempDbPath);
        logger.info('✓ Arquivo temporário removido');
      }
    } catch (error) {
      logger.warn(`Erro ao remover arquivo temporário: ${error.message}`);
    }
  }

  /**
   * Inicializar conexão com o banco
   */
  async initialize() {
    try {
      const copied = await this.copyDatabase();
      if (!copied) {
        return false;
      }

      await this.connect();
      return true;
    } catch (error) {
      logger.error(`Erro ao inicializar PlexDB: ${error.message}`);
      return false;
    }
  }
}

module.exports = PlexDatabaseAPI;
