# Multi-stage build para otimização
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar package files
COPY package.json ./

# Instalar dependências (sem frozen-lockfile pois não temos yarn.lock)
RUN yarn install --network-timeout 100000

# Copiar código fonte
COPY . .

# Stage final
FROM node:18-alpine

# Instalar dependências do sistema para SQLite
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite

WORKDIR /app

# Copiar node_modules e código da stage anterior
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./

# Criar diretórios necessários
RUN mkdir -p /app/output /app/backups /var/log

# Expor porta da API
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Comando de início
CMD ["node", "src/index.js"]
