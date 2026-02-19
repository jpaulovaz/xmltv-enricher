const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const logger = require('../utils/logger');
const routes = require('./routes');
const PlaceholdersService = require('../services/placeholdersService');

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
    this.app.use(express.json());
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
