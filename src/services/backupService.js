const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class BackupService {
  constructor(config) {
    this.outputPath = config.output.path;
    this.backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
    this.maxBackups = parseInt(process.env.MAX_BACKUPS || '5', 10);
    this.enabled = process.env.BACKUP_ENABLED !== 'false';

    if (this.enabled && !fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  backup() {
    if (!this.enabled) {
      logger.debug('Backup desabilitado');
      return null;
    }

    if (!fs.existsSync(this.outputPath)) {
      logger.debug('Arquivo de saída não existe, nada para fazer backup');
      return null;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `xmltv_backup_${timestamp}.xml`;
      const backupPath = path.join(this.backupDir, backupName);

      fs.copyFileSync(this.outputPath, backupPath);
      logger.info(`✅ Backup criado: ${backupPath}`);

      // Limpar backups antigos
      this._cleanOldBackups();

      return backupPath;
    } catch (error) {
      logger.error(`Erro ao criar backup: ${error.message}`);
      return null;
    }
  }

  _cleanOldBackups() {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith('xmltv_backup_') && f.endsWith('.xml'))
        .map(f => ({
          name: f,
          path: path.join(this.backupDir, f),
          time: fs.statSync(path.join(this.backupDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length > this.maxBackups) {
        const toDelete = files.slice(this.maxBackups);
        toDelete.forEach(file => {
          fs.unlinkSync(file.path);
          logger.debug(`Backup antigo removido: ${file.name}`);
        });
      }
    } catch (error) {
      logger.error(`Erro ao limpar backups antigos: ${error.message}`);
    }
  }

  listBackups() {
    if (!fs.existsSync(this.backupDir)) {
      return [];
    }

    return fs.readdirSync(this.backupDir)
      .filter(f => f.startsWith('xmltv_backup_') && f.endsWith('.xml'))
      .map(f => ({
        name: f,
        path: path.join(this.backupDir, f),
        size: fs.statSync(path.join(this.backupDir, f)).size,
        created: fs.statSync(path.join(this.backupDir, f)).mtime
      }))
      .sort((a, b) => b.created - a.created);
  }
}

module.exports = BackupService;
