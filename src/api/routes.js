const Enricher = require('../enricher');
const logger = require('../utils/logger');
const ConfigService = require('../services/configService');
const fs = require('fs');
const path = require('path');

const configService = new ConfigService();

module.exports = (app, apiServer) => {
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Get current status
  app.get('/api/status', (req, res) => {
    res.json(apiServer.state);
  });

  // Get statistics
  app.get('/api/stats', (req, res) => {
    const statsPath = path.join(process.cwd(), 'stats.json');
    
    if (fs.existsSync(statsPath)) {
      const stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
      res.json(stats);
    } else {
      res.json({ message: 'Nenhuma estatística disponível ainda' });
    }
  });

  // Trigger manual execution
  app.post('/api/run', async (req, res) => {
    if (apiServer.state.running) {
      return res.status(409).json({ error: 'Enricher já está em execução' });
    }

    const dryRun = req.body.dryRun || false;

    res.json({ message: 'Execução iniciada', dryRun });

    // Executar de forma assíncrona
    setImmediate(async () => {
      try {
        apiServer.updateState({ running: true, lastRun: new Date().toISOString() });
        apiServer.emitLog('info', `Iniciando execução manual${dryRun ? ' (DRY RUN)' : ''}...`);
        
        const enricher = new Enricher(apiServer.config);
        await enricher.run(dryRun, apiServer);
        
        apiServer.updateState({ running: false });
        apiServer.emitLog('info', 'Execução concluída com sucesso!');
      } catch (error) {
        apiServer.updateState({ running: false });
        apiServer.emitLog('error', `Erro na execução: ${error.message}`);
        logger.error(`Erro na execução manual: ${error.message}`);
      }
    });
  });

  // Pause scheduler
  app.post('/api/pause', (req, res) => {
    if (apiServer.state.paused) {
      return res.status(400).json({ error: 'Scheduler já está pausado' });
    }

    apiServer.scheduler.pause();
    apiServer.updateState({ paused: true });
    apiServer.emitLog('info', 'Scheduler pausado');
    
    res.json({ message: 'Scheduler pausado com sucesso' });
  });

  // Resume scheduler
  app.post('/api/resume', (req, res) => {
    if (!apiServer.state.paused) {
      return res.status(400).json({ error: 'Scheduler não está pausado' });
    }

    apiServer.scheduler.resume();
    apiServer.updateState({ paused: false });
    apiServer.emitLog('info', 'Scheduler retomado');
    
    res.json({ message: 'Scheduler retomado com sucesso' });
  });

  // Get logs
  app.get('/api/logs', (req, res) => {
    const logPath = apiServer.config.logging.file;
    
    if (fs.existsSync(logPath)) {
      const lines = req.query.lines || 100;
      const content = fs.readFileSync(logPath, 'utf-8');
      const logLines = content.split('\n').slice(-lines);
      
      res.json({ logs: logLines });
    } else {
      res.json({ logs: [] });
    }
  });

  // Get audit data
  app.get('/api/audit', (req, res) => {
    const auditPath = path.join(process.cwd(), 'auditoria_enricher.csv');
    
    if (fs.existsSync(auditPath)) {
      const content = fs.readFileSync(auditPath, 'utf-8');
      const lines = content.split('\n').slice(-100); // Últimas 100 linhas
      
      res.json({ audit: lines });
    } else {
      res.json({ audit: [] });
    }
  });

  // Get configuration
  app.get('/api/config', (req, res) => {
    const config = configService.readConfig();
    res.json(config);
  });

  // Save configuration
  app.post('/api/config', (req, res) => {
    const newConfig = req.body;
    const result = configService.saveConfig(newConfig);
    
    if (result.success) {
      apiServer.emitLog('info', '⚙️ Configurações salvas e aplicadas!');
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  });

  // Test Tvheadend connection
  app.post('/api/test/tvheadend', async (req, res) => {
    const { url, username, password } = req.body;
    const result = await configService.testTvheadendConnection(url, username, password);
    res.json(result);
  });

  // Test Plex connection
  app.post('/api/test/plex', async (req, res) => {
    const { url, token } = req.body;
    const result = await configService.testPlexConnection(url, token);
    res.json(result);
  });

  // Test TMDb API Key
  app.post('/api/test/tmdb', async (req, res) => {
    const { apiKey } = req.body;
    const result = await configService.testTmdbApiKey(apiKey);
    res.json(result);
  });

  // Test OMDb API Key
  app.post('/api/test/omdb', async (req, res) => {
    const { apiKey } = req.body;
    const result = await configService.testOmdbApiKey(apiKey);
    res.json(result);
  });
};
