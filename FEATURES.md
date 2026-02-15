# 🚀 Novas Funcionalidades - XMLTV Enricher v2.0

## 🆕 O que há de novo?

Esta versão adiciona um **Dashboard Web interativo**, **API REST completa**, **sistema de backup automático**, **notificações** e suporte a **Docker**!

---

## 📊 Dashboard Web

### Acesso

Após iniciar o aplicativo, acesse:

```
http://localhost:3000
```

### Funcionalidades

- ✅ **Status em tempo real** do enricher
- 🎮 **Controles interativos**:
  - Executar agora
  - Dry run (teste sem salvar)
  - Pausar/Retomar scheduler
- 📊 **Estatísticas detalhadas**:
  - Total de programas processados
  - Taxa de sucesso
  - Cache hits
  - APIs utilizadas
  - Duração da execução
- 📝 **Logs em tempo real** via WebSocket

---

## 🔌 REST API

### Endpoints Disponíveis

#### `GET /health`
Health check do serviço.

**Resposta:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

#### `GET /api/status`
Status atual do enricher.

**Resposta:**
```json
{
  "running": false,
  "paused": false,
  "lastRun": "2025-01-15T10:00:00.000Z",
  "lastStats": { ... }
}
```

#### `POST /api/run`
Trigger manual de execução.

**Body:**
```json
{
  "dryRun": false
}
```

**Resposta:**
```json
{
  "message": "Execução iniciada",
  "dryRun": false
}
```

#### `POST /api/pause`
Pausar o scheduler automático.

**Resposta:**
```json
{
  "message": "Scheduler pausado com sucesso"
}
```

#### `POST /api/resume`
Retomar o scheduler.

**Resposta:**
```json
{
  "message": "Scheduler retomado com sucesso"
}
```

#### `GET /api/stats`
Estatísticas da última execução.

**Resposta:**
```json
{
  "startTime": "2025-01-15T10:00:00.000Z",
  "endTime": "2025-01-15T10:05:30.000Z",
  "duration": 330,
  "totalPrograms": 1500,
  "enrichedPrograms": 1350,
  "failedPrograms": 150,
  "successRate": 90,
  "cacheHits": 800,
  "cacheHitRate": 53,
  "apiCalls": {
    "tmdb": 450,
    "tvdb": 200,
    "omdb": 50,
    "plex": 0,
    "plexdb": 0
  },
  "errors": []
}
```

#### `GET /api/logs`
Obter logs recentes.

**Query params:**
- `lines` (opcional): Número de linhas (padrão: 100)

**Resposta:**
```json
{
  "logs": [
    "[2025-01-15 10:00:00] INFO: Iniciando XMLTV Enricher...",
    "[2025-01-15 10:00:01] INFO: ✓ TMDb API configurada"
  ]
}
```

#### `GET /api/audit`
Obter dados de auditoria recentes.

**Resposta:**
```json
{
  "audit": [
    "Canal;Título Original;Busca;Status;Confiança;Resultado API;Fonte"
  ]
}
```

---

## 🚨 Sistema de Notificações

### Configuração

Adicione no `.env`:

```env
WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK
WEBHOOK_TYPE=discord
```

### Tipos Suportados

#### 1. Discord
```env
WEBHOOK_TYPE=discord
WEBHOOK_URL=https://discord.com/api/webhooks/ID/TOKEN
```

#### 2. Slack
```env
WEBHOOK_TYPE=slack
WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

#### 3. Genérico (JSON)
```env
WEBHOOK_TYPE=generic
WEBHOOK_URL=https://your-api.com/webhook
```

O payload genérico envia as estatísticas completas em JSON.

---

## 💾 Sistema de Backup

### Configuração

```env
BACKUP_ENABLED=true
BACKUP_DIR=./backups
MAX_BACKUPS=5
```

### Funcionamento

Antes de sobrescrever o XML, o sistema:
1. Cria uma cópia do arquivo anterior
2. Nomeia com timestamp: `xmltv_backup_2025-01-15T10-00-00-000Z.xml`
3. Mantém apenas os últimos N backups (configurado em `MAX_BACKUPS`)

---

## 🧪 Modo Dry Run

### Via Dashboard

Clique no botão "🧪 Dry Run" no dashboard.

### Via API

```bash
curl -X POST http://localhost:3000/api/run \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

### O que faz?

- Processa todo o XML
- Enriquece os metadados
- Gera estatísticas
- **NÃO salva** o arquivo final
- Útil para testar sem afetar o XML em produção

---

## 🐳 Docker

### Quick Start

1. **Criar arquivo `.env`:**

```bash
cp .env.example .env
# Editar .env com suas configurações
```

2. **Iniciar com Docker Compose:**

```bash
docker-compose up -d
```

3. **Acessar o dashboard:**

```
http://localhost:3000
```

### Comandos Úteis

```bash
# Ver logs
docker-compose logs -f

# Parar
docker-compose stop

# Reiniciar
docker-compose restart

# Remover
docker-compose down

# Rebuild
docker-compose up -d --build
```

### Volumes

O Docker Compose monta os seguintes volumes:

- `./output` - Arquivo XML final
- `./backups` - Backups automáticos
- `./data` - Cache SQLite e dados persistentes
- `./logs` - Arquivos de log

---

## 🔧 Variáveis de Ambiente (Novas)

```env
# API Server
API_PORT=3000

# Backup
BACKUP_ENABLED=true
BACKUP_DIR=./backups
MAX_BACKUPS=5

# Notificações
WEBHOOK_URL=
WEBHOOK_TYPE=generic

# Execução
RUN_ON_START=true
```

---

## 🐛 Troubleshooting

### Dashboard não carrega

1. Verificar se a porta 3000 está disponível:
```bash
lsof -i :3000
```

2. Alterar porta no `.env`:
```env
API_PORT=8080
```

### Logs em tempo real não funcionam

- Verificar se o WebSocket está conectado (console do navegador)
- Desabilitar ad-blockers que podem bloquear WebSockets

### Notificações não enviadas

- Verificar URL do webhook
- Testar webhook manualmente
- Conferir logs para erros

---

## 📚 Documentação Completa

Para documentação completa, consulte:

- `README.md` - Visão geral e instalação
- `INSTALLATION.md` - Guia de instalação detalhado
- `SETUP_APIS.md` - Configuração de APIs
- `TROUBLESHOOTING.md` - Solução de problemas

---

## ❤️ Contribuindo

Contribuições são bem-vindas! Abra uma issue ou pull request no GitHub.
