# Quick Start - Início Rápido

## 🚀 Começar em 5 Minutos

### 1. Instalar Dependências
```bash
cd /home/ubuntu/xmltv-enricher
npm install
```

### 2. Configurar .env
```bash
cp .env.example .env
nano .env
```

**Mínimo necessário:**
```env
TVDB_API_KEY=sua_chave_tvdb
TMDB_API_KEY=sua_chave_tmdb
TVHEADEND_URL=http://localhost:9981
OUTPUT_FILE_PATH=/home/ubuntu/xmltv-enricher/output/xmltv.xml
SCHEDULE_INTERVAL_HOURS=48
```

### 3. Testar em Desenvolvimento
```bash
npm run dev
```

### 4. Iniciar com PM2
```bash
npm run pm2:start
pm2 save
pm2 startup
```

### 5. Verificar Status
```bash
pm2 status
pm2 logs xmltv-enricher
```

---

## 📋 Comandos Úteis

```bash
# Ver logs em tempo real
pm2 logs xmltv-enricher

# Reiniciar
npm run pm2:restart

# Parar
npm run pm2:stop

# Ver arquivo gerado
cat /home/ubuntu/xmltv-enricher/output/xmltv.xml | head -50
```

---

## 📚 Documentação Completa

- [README.md](./README.md) - Visão geral
- [INSTALLATION.md](./INSTALLATION.md) - Instalação detalhada
- [SETUP_APIS.md](./SETUP_APIS.md) - Como obter chaves de API
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Problemas e soluções

---

**Pronto para começar!** 🎉
