const winston = require('winston');
const path = require('path');
const config = require('../config');
const Transport = require('winston-transport');

// Criar diretório de logs se não existir
const fs = require('fs');
const logDir = path.dirname(config.logging.file);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom transport para emitir logs via WebSocket
class WebSocketTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.apiServer = null;
  }

  setApiServer(apiServer) {
    this.apiServer = apiServer;
  }

  log(info, callback) {
    setImmediate(() => {
      if (this.apiServer) {
        this.apiServer.emitLog(info.level, info.message);
      }
    });
    callback();
  }
}

const wsTransport = new WebSocketTransport();

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      const stackTrace = stack ? `\\n${stack}` : '';
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${stackTrace}`;
    })
  ),
  defaultMeta: { service: 'xmltv-enricher' },
  transports: [
    // Console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] ${level}: ${message}`;
        })
      )
    }),
    // Arquivo
    new winston.transports.File({
      filename: config.logging.file,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // WebSocket (para dashboard)
    wsTransport
  ]
});

// Função para conectar o apiServer ao transport
logger.connectWebSocket = (apiServer) => {
  wsTransport.setApiServer(apiServer);
};

module.exports = logger;
