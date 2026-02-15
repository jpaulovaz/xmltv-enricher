FROM node:18-alpine

# Instalar dependências do sistema
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite

WORKDIR /app

# Copiar arquivos de dependências
COPY package.json ./

# Instalar dependências Node.js
RUN yarn install --network-timeout 100000 || \
    yarn install --network-timeout 100000

# Copiar TODO o código fonte
COPY src/ ./src/
COPY public/ ./public/
COPY ecosystem.config.js ./ 

# Criar diretórios necessários
RUN mkdir -p /app/output /app/backups /var/log

# Expor porta da API
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Comando de início
CMD ["node", "src/index.js"]
