const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const logger = require('../utils/logger');
const routes = require('./routes');
const PlaceholdersService = require('../services/placeholdersService');
const { auth } = require('express-openid-connect'); // <-- 1. IMPORTAÇÃO ADICIONADA AQUI

class APIServer {

  constructor(config, enricher, scheduler, manualOverrideService) {
    this.config = config;
    this.enricher = enricher;
    this.scheduler = scheduler;
    this.manualOverrideService = manualOverrideService;
    this.placeholdersService = new PlaceholdersService();
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server);
    this.port = process.env.API_PORT || 3000;

    // Estado global
    this.state = {
      running: false,
      paused: false,
      lastRun: null,
      lastStats: null
    };

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupMiddleware() {
    // <-- 2. TRUST PROXY ADICIONADO PARA FUNCIONAR COM HTTPS/CLOUDFLARE
    this.app.set('trust proxy', true);

    this.app.use(express.json());

    // --- 3. INÍCIO DO BLOCO DE AUTENTICAÇÃO OIDC (POCKET ID) ---
    if (process.env.AUTH_ENABLED === 'true') {
      this.app.use(
        auth({
          idpLogout: true,
          authRequired: true,
          auth0Logout: false,
          secret: process.env.AUTH_SECRET,
          baseURL: process.env.AUTH_BASE_URL,
          clientID: process.env.AUTH_CLIENT_ID,
          clientSecret: process.env.AUTH_CLIENT_SECRET,
          issuerBaseURL: process.env.AUTH_ISSUER,
          clientAuthMethod: 'client_secret_post',
        })
      );

      // Middleware opcional: Loga no terminal quem acessou o painel
      this.app.use((req, res, next) => {
        if (req.oidc && req.oidc.isAuthenticated()) {
          const user = req.oidc.user.name || req.oidc.user.preferred_username || req.oidc.user.email || 'Usuário';
          logger.debug(`[Auth] Acesso concedido a: ${user}`);
        }
        next();
      });
    }
    // --- FIM DO BLOCO DE AUTENTICAÇÃO ---

    // Atenção: A proteção acima deve vir ANTES desta linha estática para proteger a página
    this.app.use(express.static(path.join(__dirname, '../../public')));

    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });
  }

  setupRoutes() {
    routes(this.app, this);

    // --- CAPTURADOR DE ERROS (Adicione este bloco) ---
    this.app.use((err, req, res, next) => {
      logger.error(`[Auth/Servidor Erro] ${err.message}`);
      if (err.stack) logger.debug(err.stack);

      res.status(err.status || 500).send(`
        <div style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h2 style="color: #d9534f;">Ops! Falha na Autenticação</h2>
          <p>O servidor retornou o seguinte erro:</p>
          <pre style="background: #f4f4f4; padding: 15px; border-radius: 5px; display: inline-block; text-align: left;">${err.message}</pre>
          <p>Verifique o painel do Docker (Logs) para ver o erro completo.</p>
          <br>
          <a href="/" style="padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px;">Tentar Novamente</a>
        </div>
      `);
    });
  }

  setupWebSocket() {
    this.io.on('connection', (socket) => {
      logger.info('Cliente conectado ao WebSocket');

      // Enviar estado atual
      socket.emit('state', this.state);

      socket.on('disconnect', () => {
        logger.info('Cliente desconectado do WebSocket');
      });
    });
  }

  emitLog(level, message) {
    this.io.emit('log', { level, message, timestamp: new Date().toISOString() });
  }

  updateState(updates) {
    this.state = { ...this.state, ...updates };
    this.io.emit('state', this.state);
  }

  start() {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        logger.info(`🚀 API Server rodando na porta ${this.port}`);
        logger.info(`📊 Dashboard disponível em: http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      this.server.close(() => {
        logger.info('API Server encerrado');
        resolve();
      });
    });
  }
}

module.exports = APIServer;