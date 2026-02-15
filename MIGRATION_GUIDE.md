# 📦 Guia de Migração - v1.0 para v2.0

## Mudanças Principais

A versão 2.0 adiciona:
- ✅ Dashboard Web
- ✅ REST API
- ✅ Sistema de backup automático
- ✅ Notificações via webhook
- ✅ Modo dry-run
- ✅ Estatísticas detalhadas
- ✅ Docker/Docker Compose
- ✅ Controles de pause/resume

## Passos de Migração

### 1. Fazer Backup

```bash
# Backup completo do projeto atual
cp -r xmltv-enricher xmltv-enricher-backup

# Backup apenas dos dados
tar -czf xmltv-data-backup.tar.gz \
  cache_enricher.db \
  auditoria_enricher.csv \
  xmltv.xml \
  .env
```

### 2. Atualizar Código

```bash
cd xmltv-enricher
git pull origin main
```

Ou baixe a nova versão e substitua os arquivos.

### 3. Instalar Novas Dependências

```bash
# Com yarn (recomendado)
yarn install

# Ou com npm
npm install
```

### 4. Atualizar .env

Adicione as novas variáveis ao seu `.env` existente:

```env
# API Server (NOVO)
API_PORT=3000

# Backup (NOVO)
BACKUP_ENABLED=true
BACKUP_DIR=./backups
MAX_BACKUPS=5

# Notificações (NOVO)
WEBHOOK_URL=
WEBHOOK_TYPE=generic

# Execução (NOVO)
RUN_ON_START=true
```

### 5. Criar Diretórios

```bash
mkdir -p backups public logs
```

### 6. Verificar Compatibilidade

```bash
# Testar sintaxe
node -c src/index.js

# Verificar dependências
yarn install --check-files
```

### 7. Reiniciar com PM2

```bash
# Parar instância antiga
pm2 stop xmltv-enricher

# Limpar PM2
pm2 delete xmltv-enricher

# Iniciar nova versão
pm2 start ecosystem.config.js

# Salvar configuração
pm2 save
```

### 8. Acessar Dashboard

Abra no navegador:

```
http://localhost:3000
```

---

## Mudanças de API

### Antes (v1.0)

Não havia API REST. Apenas execução via PM2/cron.

### Agora (v2.0)

```bash
# Trigger manual
curl -X POST http://localhost:3000/api/run

# Ver status
curl http://localhost:3000/api/status

# Pausar
curl -X POST http://localhost:3000/api/pause

# Retomar
curl -X POST http://localhost:3000/api/resume
```

---

## Mudanças no Enricher

### Signature da função `run()`

**Antes:**
```javascript
await enricher.run();
```

**Agora:**
```javascript
await enricher.run(dryRun, apiServer);
```

**Nota:** Mantém retrocompatibilidade. Chamadas antigas continuam funcionando:
```javascript
await enricher.run(); // OK - usa valores padrão
```

---

## Mudanças no Scheduler

### Novas funções

```javascript
const scheduler = require('./scheduler');

scheduler.start();   // Já existia
scheduler.stop();    // Já existia
scheduler.pause();   // NOVO
scheduler.resume();  // NOVO
scheduler.isPausedStatus(); // NOVO
```

---

## Arquivos Novos

```
src/
├── api/
│   ├── server.js          # NOVO - Servidor Express
│   └── routes.js          # NOVO - Rotas da API
├── services/
│   ├── statsService.js    # NOVO - Estatísticas
│   ├── notificationService.js  # NOVO - Notificações
│   └── backupService.js   # NOVO - Backup automático
public/
├── index.html             # NOVO - Dashboard
├── app.js                 # NOVO - Frontend
└── styles.css             # NOVO - Estilos

# Docker
Dockerfile                 # NOVO
docker-compose.yml         # NOVO
.dockerignore              # NOVO

# CI/CD
.github/workflows/ci.yml   # NOVO

# Documentação
FEATURES.md                # NOVO
DOCKER_SETUP.md            # NOVO
MIGRATION_GUIDE.md         # NOVO (este arquivo)
```

---

## Arquivos Modificados

```
src/index.js               # Adicionado suporte à API
src/enricher.js            # Adicionado stats, backup, dry-run
src/scheduler.js           # Adicionado pause/resume
package.json               # Adicionadas dependências (express, socket.io)
```

---

## Variáveis de Ambiente Novas

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `API_PORT` | 3000 | Porta do dashboard/API |
| `BACKUP_ENABLED` | true | Habilitar backups |
| `BACKUP_DIR` | ./backups | Diretório de backups |
| `MAX_BACKUPS` | 5 | Máximo de backups |
| `WEBHOOK_URL` | - | URL do webhook |
| `WEBHOOK_TYPE` | generic | Tipo: generic/discord/slack |
| `RUN_ON_START` | true | Executar ao iniciar |

---

## Compatibilidade

### ✅ Retrocompatível com:

- Arquivos `.env` da v1.0
- Cache SQLite existente
- Auditoria CSV
- Estrutura de arquivos

### ⚠️ Requer atenção:

- **Porta 3000**: Certifique-se que está livre
- **Node.js 16+**: Versões antigas podem não funcionar
- **PM2**: Atualizar para última versão

---

## Rollback (se necessário)

Se algo der errado, volte para v1.0:

```bash
# Parar v2.0
pm2 stop xmltv-enricher
pm2 delete xmltv-enricher

# Restaurar backup
rm -rf xmltv-enricher
mv xmltv-enricher-backup xmltv-enricher
cd xmltv-enricher

# Restaurar dados
tar -xzf xmltv-data-backup.tar.gz

# Iniciar v1.0
pm2 start ecosystem.config.js
```

---

## Testes Pós-Migração

### 1. Verificar serviços

```bash
# Ver logs
pm2 logs xmltv-enricher

# Ver status
pm2 status
```

### 2. Testar Dashboard

Acesse `http://localhost:3000` e verifique:

- [ ] Dashboard carrega corretamente
- [ ] Status é exibido
- [ ] Botões respondem
- [ ] Logs aparecem em tempo real

### 3. Testar API

```bash
# Health check
curl http://localhost:3000/health

# Status
curl http://localhost:3000/api/status

# Stats
curl http://localhost:3000/api/stats
```

### 4. Testar execução

Via Dashboard:
- Clique em "Executar Agora"
- Observe os logs
- Verifique estatísticas

Via API:
```bash
curl -X POST http://localhost:3000/api/run \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'
```

### 5. Verificar arquivos gerados

```bash
ls -lh output/
ls -lh backups/
ls -lh *.json  # stats.json
```

---

## Problemas Comuns

### Erro: "Cannot find module 'express'"

```bash
yarn install
# ou
npm install
```

### Erro: "Port 3000 already in use"

Altere no `.env`:
```env
API_PORT=8080
```

### Dashboard não abre

1. Verificar se servidor está rodando:
```bash
pm2 logs xmltv-enricher
```

2. Verificar porta:
```bash
lsof -i :3000
```

3. Testar health:
```bash
curl http://localhost:3000/health
```

### Logs não aparecem no dashboard

- Verificar conexão WebSocket no console do navegador
- Desabilitar ad-blockers
- Testar em navegador diferente

---

## Perguntas Frequentes

### Preciso reconfigurar tudo?

Não! A v2.0 é retrocompatível. Apenas adicione as novas variáveis ao `.env`.

### Meus dados serão perdidos?

Não. O cache, auditoria e XML existentes são mantidos.

### Posso usar sem Docker?

Sim! Docker é opcional. Use PM2 como antes.

### O agendamento continua funcionando?

Sim, exatamente como antes.

### Posso desabilitar o dashboard?

Tecnicamente sim, mas não é recomendado. O dashboard usa poucos recursos.

### Como voltar para v1.0?

Veja seção "Rollback" acima.

---

## Suporte

Problemas na migração?

1. Confira os logs: `pm2 logs`
2. Consulte `TROUBLESHOOTING.md`
3. Abra issue no GitHub com detalhes

---

## Próximos Passos

Após migração bem-sucedida:

1. Configure notificações (Discord/Slack)
2. Explore o dashboard
3. Teste o modo dry-run
4. Configure backups automáticos
5. Considere usar Docker para deploy mais fácil

---

**Boa migração! 🚀**
