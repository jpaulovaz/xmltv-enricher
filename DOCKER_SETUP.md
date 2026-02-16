# 🐳 Guia de Setup com Docker

## Pré-requisitos

- Docker 20.10+
- Docker Compose 2.0+

## Instalação Rápida

### 1. Clonar o Repositório

```bash
git clone <url_do_repositorio>
cd xmltv-enricher
```

### 2. Configurar Variáveis de Ambiente

```bash
cp .env.example .env
```

Edite o arquivo `.env` e configure suas chaves de API:

```env
# APIs obrigatórias (pelo menos uma)
TMDB_API_KEY=sua_chave_tmdb
TVDB_API_KEY=sua_chave_tvdb
OMDB_API_KEY=sua_chave_omdb

# Tvheadend
TVHEADEND_URL=http://seu-servidor:9981
```

### 3. Iniciar o Container

```bash
docker-compose up -d
```

### 4. Verificar Status

```bash
docker-compose ps
docker-compose logs -f
```

### 5. Acessar Dashboard

Abra seu navegador em:

```
http://localhost:3000
```

---

## Estrutura de Diretórios

Após o primeiro start, a estrutura será:

```
xmltv-enricher/
├── output/              # XML final gerado
├── backups/             # Backups automáticos
├── data/                # Cache SQLite
│   └── cache_enricher.db
├── logs/                # Arquivos de log
│   └── xmltv-enricher.log
└── docker-compose.yml
```

---

## Comandos Úteis

### Logs

```bash
# Ver todos os logs
docker-compose logs -f

# Últimas 100 linhas
docker-compose logs --tail=100

# Logs de hoje
docker-compose logs --since="$(date '+%Y-%m-%d')"
```

### Controle

```bash
# Parar
docker-compose stop

# Iniciar
docker-compose start

# Reiniciar
docker-compose restart

# Parar e remover
docker-compose down

# Rebuild completo
docker-compose up -d --build --force-recreate
```

### Manutenção

```bash
# Limpar volumes órfãos
docker volume prune

# Limpar cache de build
docker builder prune

# Ver uso de espaço
docker system df
```

### Executar Comandos no Container

```bash
# Shell interativo
docker-compose exec xmltv-enricher sh

# Verificar arquivos
docker-compose exec xmltv-enricher ls -la /app/output

# Ver logs internos
docker-compose exec xmltv-enricher cat /var/log/xmltv-enricher.log
```

---

## Configurações Avançadas

### Alterar Porta do Dashboard

No `docker-compose.yml`:

```yaml
ports:
  - "8080:3000"  # Muda porta externa para 8080
```

Ou no `.env`:

```env
API_PORT=3000  # Porta interna (não mexer)
```

### Usar Banco do Plex

1. Adicione no `docker-compose.yml`:

```yaml
volumes:
  - /caminho/para/plex/database:/plexdb:ro
```

2. Configure no `.env`:

```env
PLEX_DB_ENABLED=true
PLEX_DB_PATH=/plexdb/com.plexapp.plugins.library.db
```

### Aumentar Concorrência

No `.env`:

```env
CONCURRENCY_LIMIT=5  # Processa 5 programas simultâneos
```

**Nota:** Mais concorrência = mais rápido, mas pode atingir rate limits das APIs.

### Alterar Intervalo de Execução

No `.env`:

```env
SCHEDULE_INTERVAL_HOURS=6  # Executa a cada 6 horas
```

---

## Integração com Plex

### Via Volume Mount

Monte o diretório onde o Plex espera o XML:

```yaml
volumes:
  - /caminho/para/plex/xmltv:/app/output
```

E configure:

```env
OUTPUT_FILE_PATH=/app/output/xmltv.xml
```

### Via URL HTTP

Configure o Plex para buscar de:

```
http://seu-servidor:3000/output/xmltv.xml
```

Adicione no `docker-compose.yml`:

```yaml
volumes:
  - ./output:/app/public/output:ro
```

---

## Notificações Discord/Slack

### Discord

1. Criar webhook no Discord:
   - Server Settings > Integrations > Webhooks > New Webhook

2. Copiar URL do webhook

3. Adicionar no `.env`:

```env
WEBHOOK_URL=https://discord.com/api/webhooks/123456/abcdef
WEBHOOK_TYPE=discord
```

### Slack

1. Criar Incoming Webhook:
   - https://api.slack.com/messaging/webhooks

2. Adicionar no `.env`:

```env
WEBHOOK_URL=https://hooks.slack.com/services/T00/B00/XXXX
WEBHOOK_TYPE=slack
```

---

## Monitoramento

### Health Check

```bash
curl http://localhost:3000/health
```

Resposta esperada:
```json
{"status":"ok","timestamp":"2025-01-15T10:00:00.000Z"}
```

### Prometheus/Grafana

Adicione ao `docker-compose.yml`:

```yaml
labels:
  - "prometheus.scrape=true"
  - "prometheus.port=3000"
  - "prometheus.path=/metrics"
```

---

## Backup e Restore

### Backup Manual

```bash
# Backup completo
tar -czf xmltv-enricher-backup.tar.gz \
  output/ backups/ data/ logs/ .env

# Apenas dados críticos
tar -czf xmltv-data-backup.tar.gz \
  data/cache_enricher.db .env
```

### Restore

```bash
# Parar container
docker-compose down

# Restaurar
tar -xzf xmltv-enricher-backup.tar.gz

# Reiniciar
docker-compose up -d
```

---

## Troubleshooting Docker

### Container não inicia

```bash
# Ver logs de erro
docker-compose logs

# Verificar variáveis de ambiente
docker-compose config

# Testar sem detach
docker-compose up
```

### Permissões de arquivo

```bash
# Dar permissões aos volumes
sudo chown -R 1000:1000 output/ backups/ data/ logs/
```

### Porta em uso

```bash
# Ver o que está usando a porta 3000
sudo lsof -i :3000

# Matar processo
sudo kill -9 <PID>
```

### Limpar tudo e recomeçar

```bash
docker-compose down -v
docker system prune -a
rm -rf output/ backups/ data/ logs/
docker-compose up -d --build
```

---

## Performance

### Build Otimizado

```bash
# Multi-stage build já está configurado no Dockerfile
docker-compose build --no-cache
```

### Reduzir Tamanho da Imagem

A imagem usa `node:18-alpine` (base pequena) e multi-stage build.

Tamanho aproximado: **~150MB**

### Cache de Layers

Docker reutiliza layers automaticamente. Para forçar rebuild:

```bash
docker-compose build --no-cache --pull
```

---

## Segurança

### Não expor publicamente

Use reverse proxy (Nginx/Traefik) com autenticação.

### Secrets do Docker

Para ambientes de produção, use Docker Secrets:

```yaml
secrets:
  tmdb_key:
    external: true

services:
  xmltv-enricher:
    secrets:
      - tmdb_key
```

### Read-only Filesystem

```yaml
services:
  xmltv-enricher:
    read_only: true
    tmpfs:
      - /tmp
      - /app/data:uid=1000,gid=1000
```

---

## CI/CD

O repositório já inclui GitHub Actions (`.github/workflows/ci.yml`).

Para habilitar:

1. Adicionar secrets no GitHub:
   - `DOCKER_USERNAME`
   - `DOCKER_PASSWORD`

2. Atualizar nome da imagem no workflow:
   ```yaml
   images: seu-usuario/xmltv-enricher
   ```

3. Push para `main` vai automaticamente buildar e enviar para Docker Hub.

---

## Suporte

Para problemas com Docker:

1. Verificar logs: `docker-compose logs`
2. Verificar health: `curl localhost:3000/health`
3. Abrir issue no GitHub com logs completos
