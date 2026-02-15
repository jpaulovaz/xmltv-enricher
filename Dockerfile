FROM node:18-alpine

# Instalar dependências do sistema
RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

# Debug: Mostrar o que está no contexto de build
RUN echo "=== BUILD CONTEXT CHECK ==="

# Copiar package.json
COPY package.json ./
RUN echo "✓ package.json copiado" && ls -la package.json

# Instalar dependências
RUN yarn install --network-timeout 100000 || yarn install --network-timeout 100000
RUN echo "✓ Dependencies instaladas" && ls -la node_modules/ | head -5

# Copiar TUDO (para debug)
COPY . /app/
RUN echo "✓ Tudo copiado. Arquivos em /app:" && ls -la /app/

# Verificar src/
RUN echo "✓ Verificando src/:" && ls -la /app/src/ || echo "❌ src/ não encontrado!"

# Verificar index.js
RUN echo "✓ Verificando index.js:" && ls -la /app/src/index.js || echo "❌ index.js não encontrado!"

# Criar diretórios
RUN mkdir -p /app/output /app/backups /var/log

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

CMD ["node", "src/index.js"]
