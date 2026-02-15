# Guia de Atualização - XMLTV Enricher v2.0

## Remover Versão Atual

### Via Docker (Recomendado)

```bash
# 1. Parar e remover o container
docker-compose down

# 2. Remover a imagem antiga (opcional, mas recomendado)
docker rmi xmltv-enricher 2>/dev/null

# 3. Remover o diretório atual (FAÇA BACKUP PRIMEIRO!)
# IMPORTANTE: Salve seus arquivos importantes antes!
cp .env .env.old  # Backup das configurações
cp -r output output_backup  # Backup do XML gerado
cd ..
rm -rf xmltv-enricher
```

### Via PM2

```bash
# 1. Parar e remover do PM2
pm2 stop xmltv-enricher
pm2 delete xmltv-enricher

# 2. Remover o diretório atual (FAÇA BACKUP PRIMEIRO!)
# IMPORTANTE: Salve seus arquivos importantes antes!
cp .env .env.old  # Backup das configurações
cp -r output output_backup  # Backup do XML gerado
cd ..
rm -rf xmltv-enricher
```

---

## Instalar Nova Versão

### 1. Clonar o Repositório

```bash
git clone https://github.com/jpaulovaz/xmltv-enricher.git
cd xmltv-enricher

# Se quiser usar a branch de desenvolvimento:
git checkout feature/v2.0-dashboard-api
```

### 2. Criar Arquivo de Configuração

```bash
# Copiar o exemplo
cp .env.example .env

# Ou restaurar seu backup (se tiver)
cp /caminho/para/.env.old .env
```

### 3. Criar Diretórios Necessários

```bash
mkdir -p output backups data logs
```

### 4. Iniciar o Aplicativo

#### Via Docker (Recomendado)

```bash
# Construir a imagem
docker-compose build

# Iniciar o container
docker-compose up -d

# Verificar se está rodando
docker-compose logs -f
```

#### Via PM2

```bash
# Instalar dependências
yarn install

# Iniciar com PM2
pm2 start ecosystem.config.js

# Salvar configuração do PM2
pm2 save

# Verificar status
pm2 status
```

#### Via Node.js Direto (para testes)

```bash
# Instalar dependências
yarn install

# Iniciar
node src/index.js
```

### 5. Acessar o Dashboard

Abra o navegador em: **http://localhost:3000**

### 6. Configurar via Dashboard

1. Clique na aba **"Configurações"**
2. Preencha os campos necessários:
   - URL do Tvheadend
   - API Keys (TMDb, TVDb, OMDb)
   - Configurações do Plex (se aplicável)
3. Use os botões **"Testar"** para validar as conexões
4. Clique em **"Salvar Configurações"**
5. Volte para a aba **"Dashboard"** e clique em **"Executar Agora"**

---

## Verificar Instalação

### Health Check

```bash
curl http://localhost:3000/health
# Resposta esperada: {"status":"ok","timestamp":"..."}
```

### Verificar Configurações

```bash
curl http://localhost:3000/api/config
# Deve retornar suas configurações em JSON
```

### Testar Conexão com Tvheadend

```bash
curl -X POST http://localhost:3000/api/test/tvheadend \
  -H "Content-Type: application/json" \
  -d '{"url": "http://SEU_TVHEADEND:9981", "username": "", "password": ""}'
```

---

## Resolução de Problemas

### Container não inicia

```bash
# Verificar logs
docker-compose logs -f

# Verificar se .env existe e está montado
docker-compose exec xmltv-enricher ls -la /app/.env
```

### Configurações não são salvas

1. Verifique se o volume do `.env` está montado corretamente no `docker-compose.yml`:
   ```yaml
   volumes:
     - ./.env:/app/.env
   ```

2. Verifique permissões do arquivo:
   ```bash
   ls -la .env
   chmod 644 .env
   ```

### Conexão recusada com Tvheadend

1. Verifique se o Tvheadend está acessível da máquina Docker:
   ```bash
   curl http://SEU_IP_TVHEADEND:9981/api/serverinfo
   ```

2. Se usar Docker, não use `localhost` - use o IP real da máquina

### Logs do aplicativo

```bash
# Docker
docker-compose logs -f

# PM2
pm2 logs xmltv-enricher

# Arquivo de log
tail -f logs/xmltv-enricher.log
```

---

## Estrutura de Diretórios

```
xmltv-enricher/
├── .env              # Suas configurações (editável via Dashboard)
├── .env.example      # Exemplo de configuração
├── docker-compose.yml
├── Dockerfile
├── package.json
├── src/              # Código fonte
├── public/           # Dashboard web
├── output/           # XMLs gerados
├── backups/          # Backups automáticos
├── data/             # Cache SQLite
└── logs/             # Arquivos de log
```
