# XMLTV Enricher

**Versão:** 1.0.0

## Visão Geral

O **XMLTV Enricher** é um aplicativo Node.js projetado para atuar como um intermediário entre o **Tvheadend** e o **Plex**. Ele baixa o arquivo XMLTV gerado pelo Tvheadend, que geralmente é pobre em metadados, e o enriquece com informações detalhadas, como capas de filmes/séries, gêneros, ano de lançamento e classificação etária.

Para isso, ele utiliza uma cadeia de APIs populares de metadados:

1.  **TVDb (TheTVDB)**: Prioridade para séries de TV.
2.  **TMDb (The Movie Database)**: Cobertura geral para filmes e séries.
3.  **OMDb (Open Movie Database)**: Fallback com dados do IMDb.

O resultado é um arquivo `xmltv.xml` completo e visualmente atraente, que melhora significativamente a experiência de visualização no Plex.

## Funcionalidades

- **Enriquecimento Automático**: Processa o XML do Tvheadend e adiciona metadados ausentes.
- **Múltiplas APIs**: Usa TVDb, TMDb e OMDb com uma lógica de fallback inteligente.
- **Agendamento Configurável**: Executa automaticamente em intervalos definidos (ex: a cada 12 horas) usando `node-cron`.
- **Gerenciamento com PM2**: Projetado para rodar como um serviço de fundo robusto com o gerenciador de processos PM2.
- **Cache Inteligente**: Armazena em memória os resultados das APIs para reduzir requisições e acelerar o processo.
- **Altamente Configurável**: Todas as chaves de API, URLs e intervalos são gerenciados através de um arquivo `.env`.
- **Logging Detalhado**: Registra todas as operações, sucessos e erros em arquivos de log para fácil depuração.
- **Fallback com Placeholder**: Garante que todos os programas tenham uma imagem, mesmo que seja um placeholder configurável.

---

## Instalação

Siga os passos abaixo para configurar e executar o XMLTV Enricher.

### Pré-requisitos

- **Node.js** (versão 16 ou superior)
- **npm** (geralmente instalado com o Node.js)
- **PM2** (gerenciador de processos para Node.js)

Se você não tiver o PM2 instalado, instale-o globalmente:

```bash
npm install pm2 -g
```

### 1. Clonar ou Baixar o Projeto

Primeiro, obtenha os arquivos do projeto. Se estiver usando git:

```bash
git clone <url_do_repositorio> xmltv-enricher
cd xmltv-enricher
```

### 2. Instalar Dependências

Navegue até o diretório do projeto e instale as dependências do Node.js:

```bash
npm install
```

### 3. Configurar Variáveis de Ambiente

Copie o arquivo de exemplo `.env.example` para um novo arquivo chamado `.env`:

```bash
cp .env.example .env
```

Agora, edite o arquivo `.env` com suas próprias configurações. Este é o passo mais importante.

```env
# URL do seu Tvheadend (geralmente http://ip_do_servidor:9981)
TVHEADEND_URL=http://localhost:9981
TVHEADEND_USERNAME=
TVHEADEND_PASSWORD=

# Chaves das APIs (obtenha nos sites oficiais)
TVDB_API_KEY=SUA_CHAVE_TVDB
TVDB_PIN=SEU_PIN_TVDB (se aplicável)
TMDB_API_KEY=SUA_CHAVE_TMDB
OMDB_API_KEY=SUA_CHAVE_OMDB

# Intervalo de execução em horas
SCHEDULE_INTERVAL_HOURS=12

# Caminho onde o arquivo XML final será salvo
OUTPUT_FILE_PATH=/home/ubuntu/xmltv-enricher/output/xmltv.xml

# URL de uma imagem para usar quando nenhuma capa for encontrada
PLACEHOLDER_IMAGE_URL=https://raw.githubusercontent.com/seu-usuario/seu-repo/main/placeholder.jpg

# Configurações de cache e log (geralmente não precisam ser alteradas)
CACHE_ENABLED=true
CACHE_TTL_HOURS=24
LOG_LEVEL=info
LOG_FILE=/var/log/xmltv-enricher.log
```

**Importante:**
- Você não precisa preencher todas as chaves de API. O sistema usará apenas as que forem fornecidas.
- Certifique-se de que o caminho em `OUTPUT_FILE_PATH` seja acessível pelo Plex.
- Crie um repositório no GitHub (ou use outro serviço) para hospedar sua imagem de placeholder e coloque a URL em `PLACEHOLDER_IMAGE_URL`.

---

## Execução com PM2

O PM2 garante que o aplicativo continue rodando em segundo plano e reinicie automaticamente em caso de falhas ou após a reinicialização do servidor.

### 1. Iniciar a Aplicação

No diretório do projeto, execute o seguinte comando:

```bash
pm2 start ecosystem.config.js
```

O PM2 irá registrar o aplicativo e iniciá-lo. A primeira execução do enriquecimento começará imediatamente.

### 2. Salvar a Configuração do PM2

Para garantir que o PM2 reinicie o aplicativo após o boot do sistema, execute:

```bash
pm2 save
```

### 3. Comandos Úteis do PM2

- **Verificar o status da aplicação:**
  ```bash
  pm2 status
  ```

- **Ver os logs em tempo real:**
  ```bash
  pm2 logs xmltv-enricher
  ```

- **Reiniciar a aplicação:**
  ```bash
  pm2 restart xmltv-enricher
  ```

- **Parar a aplicação:**
  ```bash
  pm2 stop xmltv-enricher
  ```

- **Remover a aplicação do PM2:**
  ```bash
  pm2 delete xmltv-enricher
  ```

---

## Estrutura do Projeto

```
xmltv-enricher/
├── src/                     # Código-fonte
│   ├── index.js             # Ponto de entrada
│   ├── scheduler.js         # Agendador (node-cron)
│   ├── enricher.js          # Lógica principal
│   ├── xmlParser.js         # Parser de XML
│   ├── apis/                # Clientes das APIs
│   └── services/            # Serviços de cache e matching
├── output/                  # Diretório de saída padrão
├── .env.example             # Arquivo de exemplo para configuração
├── ecosystem.config.js      # Configuração do PM2
├── package.json             # Dependências NPM
└── README.md                # Esta documentação
```

---

## Licença

Este projeto é distribuído sob a licença MIT.
