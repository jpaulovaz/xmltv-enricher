# XMLTV Enricher v2.0 🎬

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16-brightgreen)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-supported-blue)](https://www.docker.com/)

> **Enriqueça automaticamente seu EPG do Tvheadend com metadados completos, capas e informações detalhadas de múltiplas APIs!**

---

## 📋 Índice

- [Visão Geral](#-visão-geral)
- [✨ Novidades v2.0](#-novidades-v20)
- [Funcionalidades](#-funcionalidades)
- [Instalação Rápida](#-instalação-rápida)
  - [Com Docker](#opção-1-docker-recomendado-)
  - [Sem Docker](#opção-2-nodejs-direto)
- [Configuração](#️-configuração)
- [Dashboard Web](#-dashboard-web)
- [API REST](#-api-rest)
- [Uso](#-uso)
- [Documentação](#-documentação)
- [Troubleshooting](#-troubleshooting)
- [Contribuindo](#-contribuindo)
- [Licença](#-licença)

---

## 🎯 Visão Geral

O **XMLTV Enricher** é um aplicativo Node.js que atua como intermediário entre o **Tvheadend** e o **Plex**. Ele baixa o arquivo XMLTV gerado pelo Tvheadend (geralmente pobre em metadados) e o enriquece automaticamente com:

- 🖼️ **Capas de filmes e séries**
- 🎭 **Gêneros**
- 📅 **Ano de lançamento**
- 🔞 **Classificação etária**
- 📺 **Informações de episódios**

### APIs Utilizadas

O enricher consulta múltiplas APIs com fallback inteligente:

1. **TVDb (TheTVDB)** - Prioridade para séries de TV
2. **TMDb (The Movie Database)** - Filmes e séries
3. **OMDb (Open Movie Database)** - Fallback com dados do IMDb
4. **Plex** - Integração direta (opcional)

---

## ✨ Novidades v2.0

### 🆕 Principais Adições

| Feature | Descrição |
|---------|-----------|
| 🖥️ **Dashboard Web** | Interface visual moderna com controles em tempo real |
| ⚙️ **Configurações Web** | Edite todas as configurações via interface (sem editar .env) |
| 🔌 **REST API** | Controle remoto completo via HTTP |
| 📨 **Notificações** | Webhooks para Discord, Slack ou genérico |
| 💾 **Backup Automático** | Salva versões anteriores do XML |
| 🧪 **Modo Dry-Run** | Teste sem salvar arquivo final |
| 📊 **Estatísticas** | Métricas detalhadas de cada execução |
| 📝 **Logs Detalhados** | Visualização completa de todos os logs em tempo real |
| 🐳 **Docker** | Containerização completa |
| ⏸️ **Pause/Resume** | Controle do agendamento |

---

## 🚀 Funcionalidades

### Core
- ✅ Enriquecimento automático de metadados
- ✅ Múltiplas APIs com fallback inteligente
- ✅ Cache SQLite persistente (reduz chamadas de API)
- ✅ Agendamento configurável (cron)
- ✅ Processamento paralelo (concorrência ajustável)
- ✅ Sistema de matching fuzzy (Jaro-Winkler)
- ✅ Auditoria CSV completa

### v2.0
- ✅ Dashboard web interativo (porta 3000)
- ✅ API REST para automação
- ✅ Logs em tempo real via WebSocket
- ✅ Sistema de backup com rotação
- ✅ Notificações webhook
- ✅ Estatísticas detalhadas (JSON)
- ✅ Healthcheck integrado
- ✅ Docker + Docker Compose

---

## ⚡ Instalação Rápida

### Opção 1: Docker (Recomendado) 🐳

```bash
# 1. Clonar repositório
git clone https://github.com/jpaulovaz/xmltv-enricher.git
cd xmltv-enricher

# 2. Configurar variáveis
cp .env.example .env
# Edite .env com suas chaves de API

# 3. Iniciar
docker-compose up -d

# 4. Acessar dashboard
# http://localhost:3000
```

**Pronto!** 🎉

### Opção 2: Node.js Direto

```bash
# 1. Clonar repositório
git clone https://github.com/jpaulovaz/xmltv-enricher.git
cd xmltv-enricher

# 2. Instalar dependências
yarn install
# ou: npm install

# 3. Configurar
cp .env.example .env
# Edite .env com suas chaves de API

# 4. Iniciar
node src/index.js

# 5. Acessar dashboard
# http://localhost:3000
```

---

## ⚙️ Configuração

### Variáveis de Ambiente Essenciais

```env
# APIs (pelo menos uma é necessária)
TMDB_API_KEY=sua_chave_tmdb
TVDB_API_KEY=sua_chave_tvdb
OMDB_API_KEY=sua_chave_omdb

# Tvheadend
TVHEADEND_URL=http://seu-servidor:9981
TVHEADEND_USERNAME=
TVHEADEND_PASSWORD=

# Processamento
SCHEDULE_INTERVAL_HOURS=12
CONCURRENCY_LIMIT=3

# Dashboard
API_PORT=3000

# Notificações (opcional)
WEBHOOK_URL=https://discord.com/api/webhooks/...
WEBHOOK_TYPE=discord
```

### Obter Chaves de API

| API | Link | Gratuito? |
|-----|------|-----------|
| TMDb | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) | ✅ Sim |
| TVDb | [thetvdb.com/api-information](https://thetvdb.com/api-information) | ✅ Sim (até 10k/mês) |
| OMDb | [omdbapi.com/apikey.aspx](http://www.omdbapi.com/apikey.aspx) | ✅ Sim (até 1k/dia) |

📚 **Guia completo**: [SETUP_APIS.md](SETUP_APIS.md)

---

## 🖥️ Dashboard Web

Acesse `http://localhost:3000` para ver:

![Dashboard Preview](https://via.placeholder.com/800x400?text=Dashboard+Preview)

### Funcionalidades do Dashboard

#### 📊 Estatísticas em Tempo Real
- Total de programas processados
- Taxa de sucesso
- Cache hits
- APIs utilizadas (TMDb, TVDb, OMDb, Plex, PlexDB)

#### 🎮 Controles Interativos
- ▶️ **Executar Agora** - Inicia o enriquecimento imediatamente
- 🧪 **Dry Run** - Teste sem salvar o arquivo final
- ⏸️ **Pausar** - Pausa o scheduler automático
- ▶️ **Retomar** - Retoma o scheduler pausado

#### 📝 Logs em Tempo Real
- WebSocket conectado automaticamente
- **Auto-scroll** - Segue automaticamente os novos logs
- **Mostrar logs detalhados** - Toggle para ver/ocultar logs de debug
- **Filtro por nível** - Todos, Info, Warn, Error, Debug
- 🗑️ **Limpar** - Remove todos os logs da visualização

---

## ⚙️ Configurações Web (Novo v2.0)

A nova aba **Configurações** permite editar TODAS as variáveis de ambiente diretamente pela interface, **sem necessidade de editar o arquivo `.env` manualmente**.

### Como Usar

1. Acesse o Dashboard: `http://localhost:3000`
2. Clique na aba **"⚙️ Configurações"**
3. Edite os campos desejados
4. Clique em **"💾 Salvar Configurações"**
5. **Reinicie o aplicativo** para aplicar as mudanças

### Seções Disponíveis

| Seção | Campos |
|-------|--------|
| 📡 **Tvheadend** | URL, Usuário, Senha |
| 🔌 **APIs de Metadados** | TMDb Key, TVDb Key, TVDb PIN, OMDb Key, Prioridade |
| ⚡ **Processamento** | Intervalo de agendamento, Concorrência, Executar ao iniciar |
| 💾 **Cache** | Habilitar cache, TTL (horas) |
| 💾 **Backup** | Habilitar backup, Máximo de backups |
| 📨 **Notificações** | URL do Webhook, Tipo (Discord/Slack/Genérico) |
| 📝 **Logging** | Nível de log (error/warn/info/debug) |

### API de Configurações

```bash
# Ler configurações atuais
GET /api/config

# Salvar novas configurações
POST /api/config
Content-Type: application/json

{
  "TMDB_API_KEY": "sua_chave",
  "LOG_LEVEL": "debug",
  "SCHEDULE_INTERVAL_HOURS": "6"
}
```

**Resposta de sucesso:**
```json
{
  "success": true,
  "message": "Configurações salvas. Reinicie o aplicativo para aplicar."
}
```

> ⚠️ **Importante**: Após salvar as configurações, é necessário reiniciar o aplicativo para que as mudanças entrem em vigor.

---

## 🔌 API REST

Base URL: `http://localhost:3000`

### Endpoints

#### Health Check
```bash
GET /health
```
**Resposta:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:00:00.000Z"
}
```

#### Status Atual
```bash
GET /api/status
```
**Resposta:**
```json
{
  "running": false,
  "paused": false,
  "lastRun": "2025-01-15T10:00:00.000Z"
}
```

#### Executar Manualmente
```bash
POST /api/run
Content-Type: application/json

{
  "dryRun": false
}
```

#### Pausar Scheduler
```bash
POST /api/pause
```

#### Retomar Scheduler
```bash
POST /api/resume
```

#### Estatísticas
```bash
GET /api/stats
```
**Resposta:**
```json
{
  "totalPrograms": 1500,
  "enrichedPrograms": 1350,
  "successRate": 90,
  "cacheHits": 800,
  "duration": 330,
  "apiCalls": {
    "tmdb": 450,
    "tvdb": 200
  }
}
```

📚 **Documentação completa**: [FEATURES.md](FEATURES.md)

---

## 📖 Uso

### Execução Manual

```bash
# Via API
curl -X POST http://localhost:3000/api/run

# Via Dashboard
# Clique no botão "▶️ Executar Agora"
```

### Dry Run (Teste sem Salvar)

```bash
# Via API
curl -X POST http://localhost:3000/api/run \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# Via Dashboard
# Clique no botão "🧪 Dry Run"
```

### Pausar Agendamento

```bash
# Via API
curl -X POST http://localhost:3000/api/pause

# Via Dashboard
# Clique no botão "⏸️ Pausar"
```

### Ver Logs

```bash
# Docker
docker-compose logs -f

# Arquivo
tail -f /var/log/xmltv-enricher.log

# Dashboard
# Logs aparecem automaticamente em tempo real
```

---

## 📚 Documentação

| Documento | Descrição |
|-----------|-----------|
| [FEATURES.md](FEATURES.md) | Guia completo de todas as funcionalidades v2.0 |
| [DOCKER_SETUP.md](DOCKER_SETUP.md) | Setup e troubleshooting Docker |
| [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) | Migração da v1.0 para v2.0 |
| [SETUP_APIS.md](SETUP_APIS.md) | Como obter chaves de API |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Solução de problemas comuns |

---

## 🔧 Troubleshooting

### Dashboard não abre

```bash
# Verificar se serviço está rodando
curl http://localhost:3000/health

# Docker: Ver logs
docker-compose logs

# Verificar porta
lsof -i :3000
```

### Nenhum programa enriquecido

1. ✅ Verificar chaves de API no `.env`
2. ✅ Testar APIs manualmente:
   ```bash
   curl -X GET http://localhost:3000/api/stats
   ```
3. ✅ Ver logs de erro
4. ✅ Aumentar `LOG_LEVEL=debug` no `.env`

### Erros de Rate Limit

- Reduza `CONCURRENCY_LIMIT` no `.env`
- Aumente `CACHE_TTL_HOURS` para usar mais cache
- Distribua entre múltiplas APIs

📚 **Mais soluções**: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## 🐳 Docker

### Quick Start

```bash
docker-compose up -d
```

### Comandos Úteis

```bash
# Ver logs
docker-compose logs -f

# Reiniciar
docker-compose restart

# Parar
docker-compose stop

# Remover tudo
docker-compose down -v
```

### Volumes Persistentes

```yaml
volumes:
  - ./output:/app/output        # XML final
  - ./backups:/app/backups      # Backups
  - ./data:/app                 # Cache SQLite
  - ./logs:/var/log             # Logs
```

📚 **Guia completo**: [DOCKER_SETUP.md](DOCKER_SETUP.md)

---

## 🎨 Arquitetura

```
┌─────────────────┐
│   Tvheadend     │
│   (EPG source)  │
└────────┬────────┘
         │ XML pobre em metadados
         ▼
┌─────────────────────────────────┐
│     XMLTV Enricher              │
│  ┌───────────────────────────┐  │
│  │  Dashboard Web (port 3000)│  │
│  ├───────────────────────────┤  │
│  │  REST API                 │  │
│  ├───────────────────────────┤  │
│  │  Enricher Engine          │  │
│  │  - Cache SQLite           │  │
│  │  - Fuzzy Matching         │  │
│  │  - Parallel Processing    │  │
│  └───────────────────────────┘  │
│         │                        │
│         ├─► TMDb API             │
│         ├─► TVDb API             │
│         └─► OMDb API             │
└────────┬────────────────────────┘
         │ XML enriquecido
         ▼
┌─────────────────┐
│      Plex       │
│   (EPG viewer)  │
└─────────────────┘
```

---

## 🤝 Contribuindo

Contribuições são bem-vindas! 

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -m 'feat: Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

---

## 📊 Estatísticas do Projeto

- **Linguagem**: JavaScript (Node.js)
- **Dependências**: 8 principais
- **APIs Suportadas**: 6
- **Linhas de Código**: ~3000
- **Cobertura de Testes**: Em desenvolvimento

---

## 📝 Changelog

### v2.0.0 (2025-01-15)

**🆕 Adicionado:**
- Dashboard web interativo
- REST API completa
- Sistema de notificações (Discord/Slack/Genérico)
- Backup automático com rotação
- Modo dry-run
- Estatísticas detalhadas
- Docker e Docker Compose
- CI/CD com GitHub Actions
- Pause/resume do scheduler
- Logs em tempo real via WebSocket

**🔄 Modificado:**
- Enricher com coleta de estatísticas
- Scheduler com controle de pausa
- Estrutura de configuração expandida

**📚 Documentação:**
- FEATURES.md
- DOCKER_SETUP.md
- MIGRATION_GUIDE.md

### v1.0.0 (2024-12-01)

- Release inicial
- Enriquecimento básico via APIs
- Cache SQLite
- Agendamento cron
- Suporte PM2

---

## 🌟 Agradecimentos

- [Tvheadend](https://tvheadend.org/) - EPG source
- [TMDb](https://www.themoviedb.org/) - API de metadados
- [TVDb](https://thetvdb.com/) - API de séries
- [OMDb](http://www.omdbapi.com/) - API IMDb
- Comunidade Plex

---

## 📞 Suporte

- 🐛 **Issues**: [GitHub Issues](https://github.com/jpaulovaz/xmltv-enricher/issues)
- 💬 **Discussões**: [GitHub Discussions](https://github.com/jpaulovaz/xmltv-enricher/discussions)
- 📧 **Email**: (adicione seu email se quiser)

---

## 📄 Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

---

## ⭐ Star History

Se este projeto te ajudou, considere dar uma ⭐!

---

<div align="center">

**Feito com ❤️ por [jpaulovaz](https://github.com/jpaulovaz)**

[⬆ Voltar ao topo](#xmltv-enricher-v20-)

</div>
