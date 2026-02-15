FROM node:18-alpine

# Instalar dependências do sistema
RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

# Copiar package.json primeiro
COPY package.json ./

# Instalar dependências
RUN yarn install --network-timeout 100000 || yarn install --network-timeout 100000

# Copiar código fonte EXPLICITAMENTE
COPY src ./src
COPY public ./public

# Verificar se foi copiado (debug)
RUN echo "=== Verificando arquivos ===" && \
    ls -la /app/ && \
    echo "=== Verificando src/ ===" && \
    ls -la /app/src/ && \
    echo "=== Verificando index.js ===" && \
    test -f /app/src/index.js && echo "✓ index.js existe!" || echo "✗ index.js NÃO existe!"

# Criar diretórios
RUN mkdir -p /app/output /app/backups /app/logs /app/data /app/reports

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

CMD ["node", "src/index.js"]
