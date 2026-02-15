# XMLTV Enricher v2.0 - PRD (Product Requirements Document)

## Original Problem Statement
Análise completa do aplicativo GitHub `xmltv-enricher` para identificar oportunidades de melhoria. O aplicativo intercepta arquivos XML EPG do Tvheadend e os enriquece com dados adicionais como capas de APIs externas (TMDb, TVDb, OMDb).

## User Requirements
1. **Dashboard com Configurações**: Implementar página "Settings" no dashboard web para gerenciar todas as configurações da aplicação, substituindo a necessidade de editar o `.env` diretamente.
2. **Logs Detalhados em Tempo Real**: Melhorar a visualização de logs no dashboard com saída detalhada em tempo real, com toggle entre resumo e detalhado.
3. **Atualizar Documentação**: Atualizar o `README.md` para refletir as novas funcionalidades.
4. **Push para GitHub**: Enviar todas as mudanças para a branch `feature/v2.0-dashboard-api`.

## User Personas
- **Administrador de Mídia**: Usuário técnico que gerencia servidor Tvheadend/Plex e precisa de EPG enriquecido.
- **Entusiasta de Home Theater**: Usuário que quer metadados completos (capas, gêneros, descrições) no guia de programação.

## Core Requirements
- ✅ Dashboard web interativo (porta 3000)
- ✅ Página de Configurações via interface (sem editar .env)
- ✅ API REST para controle remoto
- ✅ Logs em tempo real via WebSocket com filtros
- ✅ Sistema de backup automático
- ✅ Notificações webhook (Discord/Slack)
- ✅ Docker e Docker Compose

## What's Been Implemented (Feb 2025)

### Session 1 - Major Refactoring (v2.0)
- REST API (Express.js) para controle da aplicação
- Dashboard web estático (vanilla JS, HTML, CSS)
- Suporte Docker (Dockerfile, docker-compose.yml)
- CI/CD workflow (GitHub Actions)
- Sistema de backup, controle do scheduler, notificações webhook
- Documentação extensiva (FEATURES.md, DOCKER_SETUP.md, MIGRATION_GUIDE.md)

### Session 2 - Settings & Logs
- **Página de Configurações Web**: Formulário completo para editar todas as variáveis de ambiente via dashboard
- **API /api/config**: GET para ler e POST para salvar configurações
- **ConfigService**: Serviço para gerenciar leitura/escrita do .env
- **Logs em Tempo Real**: WebSocket transport para Winston logger
- **Controles de Log**: Auto-scroll, filtro por nível, toggle de logs detalhados
- **README.md**: Atualizado com documentação das novas funcionalidades
- **data-testid**: Adicionados aos elementos HTML para melhor testabilidade

### Session 3 - Melhorias Completas
- **Bug fix salvamento**: Corrigido problema de configurações não sendo aplicadas - agora atualiza process.env em tempo real
- **Seção Plex completa**: Campos para URL, Token, PlexDB habilitado e caminho do banco
- **RUN_ON_START = false**: Padrão alterado para não executar automaticamente na inicialização
- **Botões de Teste de Conexão**:
  - Testar Tvheadend (verifica conexão e retorna versão)
  - Testar Plex (verifica conexão e retorna nome do servidor)
  - Testar TMDb API Key
  - Testar OMDb API Key
- **Validação de campos**: URLs, porta, intervalo, concorrência, threshold
- **Novo alerta informativo**: Mensagem clara sobre aplicação automática das configurações
- **Novos endpoints**:
  - POST /api/test/tvheadend
  - POST /api/test/plex
  - POST /api/test/tmdb
  - POST /api/test/omdb

## Technical Architecture
```
/app
├── public/           # Frontend estático
│   ├── index.html    # Dashboard HTML com tabs
│   ├── app.js        # JavaScript (tabs, WebSocket, forms)
│   └── styles.css    # Estilos CSS
├── src/
│   ├── api/
│   │   ├── server.js   # Express + Socket.IO
│   │   └── routes.js   # Endpoints REST
│   ├── services/
│   │   └── configService.js  # Gerenciamento de .env
│   ├── utils/
│   │   └── logger.js   # Winston + WebSocket transport
│   └── index.js        # Entry point
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Key API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| /health | GET | Health check |
| /api/status | GET | Estado atual (running, paused) |
| /api/stats | GET | Estatísticas da última execução |
| /api/config | GET | Ler configurações |
| /api/config | POST | Salvar configurações |
| /api/run | POST | Executar enriquecimento |
| /api/pause | POST | Pausar scheduler |
| /api/resume | POST | Retomar scheduler |

## Testing Status
- ✅ Backend API: Todos os endpoints testados via curl
- ✅ Frontend: Dashboard e Settings funcionando
- ✅ WebSocket: Logs em tempo real funcionando
- ✅ ConfigService: Leitura/escrita do .env funcionando

## Prioritized Backlog

### P0 (Done)
- [x] Página de Configurações Web
- [x] Logs detalhados em tempo real
- [x] Atualização do README.md
- [x] Correção do logger.js (fallback para LOG_FILE)

### P1 (Pending)
- [ ] Push para GitHub (branch feature/v2.0-dashboard-api)

### P2 (Future)
- [ ] Testes automatizados Playwright para frontend
- [ ] Validação de campos no formulário de configurações
- [ ] Exportar/importar configurações como arquivo
- [ ] Histórico de execuções no dashboard

## GitHub Status
- Branch: `feature/v2.0-dashboard-api`
- Commits pendentes: 25 commits à frente do origin
- Pronto para push

## Next Steps
1. Usuário deve usar "Save to Github" para fazer push das alterações
2. Após merge, fazer release da v2.0
