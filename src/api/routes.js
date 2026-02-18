const Enricher = require('../enricher');
const logger = require('../utils/logger');
const ConfigService = require('../services/configService');
const fs = require('fs');
const path = require('path');
const ManualOverrideService = require('../services/manualOverrideService');

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
    const auditPath = path.join(process.cwd(), 'data', 'auditoria_enricher.csv');
    const filter = req.query.status;

    // CORREÇÃO PARA O LIMITE 0 (TUDO)
    const limitParam = req.query.limit;
    const limit = (limitParam !== undefined && limitParam !== "") ? parseInt(limitParam) : 20;

    if (fs.existsSync(auditPath)) {
      const content = fs.readFileSync(auditPath, 'utf-8');
      let lines = content.split('\n').filter(line => line.trim() !== '');

      const header = lines[0];
      let dataLines = lines.slice(1);

      // FILTRO DE STATUS
      if (filter && filter !== "") {
        // Filtramos as linhas que contenham exatamente o texto selecionado no select
        dataLines = dataLines.filter(line => line.includes(filter));
      }

      // LÓGICA DE LIMITE
      // Se limit for 0, retorna dataLines inteiro. Caso contrário, corta os últimos X.
      const resultLines = (limit === 0) ? dataLines : dataLines.slice(-limit);

      res.json({ audit: [header, ...resultLines] });
    } else {
      res.json({ audit: [] });
    }
  });

  // Download audit file
  app.get('/api/audit/download', (req, res) => {
    const auditPath = path.join(process.cwd(), 'data', 'auditoria_enricher.csv');

    if (fs.existsSync(auditPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="auditoria_${timestamp}.csv"`);
      res.sendFile(auditPath);
    } else {
      res.status(404).json({ error: 'Arquivo de auditoria não encontrado' });
    }
  });

  // Get dictionary
  app.get('/api/dictionary', (req, res) => {
    const dictPath = path.join(process.cwd(), 'cleaner_dictionary.txt');

    if (fs.existsSync(dictPath)) {
      const content = fs.readFileSync(dictPath, 'utf-8');
      const lines = content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      // Separar comentários de termos
      const comments = lines.filter(line => line.startsWith('#'));
      const terms = lines.filter(line => !line.startsWith('#'));

      res.json({
        terms,
        comments,
        totalTerms: terms.length
      });
    } else {
      res.json({ terms: [], comments: [], totalTerms: 0 });
    }
  });

  // Save dictionary (COM ORDENAÇÃO AUTOMÁTICA)
  app.post('/api/dictionary', (req, res) => {
    const { terms } = req.body;
    const dictPath = path.join(process.cwd(), 'cleaner_dictionary.txt');

    try {
      const header = [
        '# ============================================',
        '# Dicionário de Limpeza de Títulos',
        '# ============================================',
        '# Adicione prefixos que devem ser removidos dos títulos',
        '# Um termo por linha, sem dois-pontos no final',
        '# Linhas que começam com # são ignoradas',
        '# ============================================',
        ''
      ];

      // Limpar, validar e ORDENAR por tamanho (maior para menor)
      const cleanTerms = terms
        .map(t => t.trim())
        .filter(t => t.length > 0 && !t.startsWith('#'))
        .sort((a, b) => b.length - a.length);

      const content = header.join('\n') + cleanTerms.join('\n') + '\n';
      fs.writeFileSync(dictPath, content, 'utf-8');

      logger.info(`Dicionário atualizado com ${cleanTerms.length} termos`);
      apiServer.emitLog('info', `📖 Dicionário atualizado e reordenado: ${cleanTerms.length} termos`);

      // Tenta recarregar na memória imediatamente
      try {
        const { reloadDictionary } = require('../utils/helpers');
        reloadDictionary();
      } catch (e) { }

      res.json({
        success: true,
        message: `Dicionário salvo e ordenado com ${cleanTerms.length} termos`,
        totalTerms: cleanTerms.length
      });
    } catch (error) {
      logger.error(`Erro ao salvar dicionário: ${error.message}`);
      res.status(500).json({
        success: false,
        error: `Erro ao salvar: ${error.message}`
      });
    }
  });

  // Add single term to dictionary (COM REORDENAÇÃO)
  app.post('/api/dictionary/add', (req, res) => {
    const { term } = req.body;
    const dictPath = path.join(process.cwd(), 'cleaner_dictionary.txt');

    if (!term || term.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Termo inválido' });
    }

    try {
      const cleanTerm = term.trim();
      let content = '';
      if (fs.existsSync(dictPath)) {
        content = fs.readFileSync(dictPath, 'utf-8');
      }

      // Lê linhas existentes ignorando comentários
      const lines = content.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('#'));

      if (lines.some(l => l.toLowerCase() === cleanTerm.toLowerCase())) {
        return res.json({ success: false, error: 'Termo já existe no dicionário' });
      }

      // Adiciona e REORDENA TUDO
      const allTerms = [...lines, cleanTerm].sort((a, b) => b.length - a.length);

      // Recria o arquivo com header
      const header = [
        '# ============================================',
        '# Dicionário de Limpeza de Títulos',
        '# ============================================',
        '# Adicione prefixos que devem ser removidos dos títulos',
        '# Um termo por linha, sem dois-pontos no final',
        '# Linhas que começam com # são ignoradas',
        '# ============================================',
        ''
      ];

      fs.writeFileSync(dictPath, header.join('\n') + allTerms.join('\n') + '\n', 'utf-8');

      logger.info(`Termo adicionado ao dicionário: ${cleanTerm}`);
      apiServer.emitLog('info', `📖 Termo adicionado: "${cleanTerm}"`);

      // Atualiza memória
      try {
        const { reloadDictionary } = require('../utils/helpers');
        reloadDictionary();
      } catch (e) { }

      res.json({
        success: true,
        message: `Termo "${cleanTerm}" adicionado com sucesso`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: `Erro ao adicionar termo: ${error.message}`
      });
    }
  });

  // Delete term from dictionary
  app.delete('/api/dictionary/:term', (req, res) => {
    const termToDelete = decodeURIComponent(req.params.term);
    const dictPath = path.join(process.cwd(), 'cleaner_dictionary.txt');

    try {
      if (!fs.existsSync(dictPath)) {
        return res.status(404).json({ success: false, error: 'Dicionário não encontrado' });
      }

      const content = fs.readFileSync(dictPath, 'utf-8');
      const lines = content.split('\n');
      const newLines = lines.filter(line => line.trim().toLowerCase() !== termToDelete.toLowerCase());

      if (lines.length === newLines.length) {
        return res.json({ success: false, error: 'Termo não encontrado no dicionário' });
      }

      fs.writeFileSync(dictPath, newLines.join('\n'), 'utf-8');

      logger.info(`Termo removido do dicionário: ${termToDelete}`);
      apiServer.emitLog('info', `📖 Termo removido: "${termToDelete}"`);

      res.json({
        success: true,
        message: `Termo "${termToDelete}" removido com sucesso`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: `Erro ao remover termo: ${error.message}`
      });
    }
  });

  // Get configuration
  app.get('/api/config', (req, res) => {
    const config = configService.readConfig();
    res.json(config);
  });

  // Save configuration (COM REINÍCIO DO SCHEDULER)
  app.post('/api/config', (req, res) => {
    // 1. Captura o intervalo atual ANTES de salvar
    const oldInterval = apiServer.config.processing.scheduleIntervalHours;

    const newConfig = req.body;
    const result = configService.saveConfig(newConfig);

    if (result.success) {
      apiServer.emitLog('info', '⚙️ Configurações salvas e aplicadas!');

      // 2. Verifica se o usuário mudou o intervalo
      if (newConfig.SCHEDULE_INTERVAL_HOURS) {
        const newInterval = parseInt(newConfig.SCHEDULE_INTERVAL_HOURS);

        // Se mudou e é um número válido...
        if (!isNaN(newInterval) && newInterval !== oldInterval) {
          apiServer.emitLog('info', `⏰ Intervalo alterado de ${oldInterval}h para ${newInterval}h. Reiniciando Scheduler...`);

          // Reinicia o Scheduler usando a referência dentro do apiServer
          if (apiServer.scheduler) {
            apiServer.scheduler.stop();
            // Ao iniciar novamente, ele vai ler o valor atualizado do config.js
            apiServer.scheduler.start(apiServer);
          }
        }
      }

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

  // Manual Overrides
  app.get('/api/overrides', async (req, res) => {
    const data = await ManualOverrideService.listAll();
    res.json(data);
  });

  app.post('/api/overrides', async (req, res) => {
    const { title, tmdbId, type } = req.body;

    if (!title || !tmdbId || !type) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    await ManualOverrideService.saveOverride(title, tmdbId, type);

    res.json({ success: true });
  });

  app.delete('/api/overrides/:id', async (req, res) => {
    await ManualOverrideService.deleteById(req.params.id);
    res.json({ success: true });
  });
};
