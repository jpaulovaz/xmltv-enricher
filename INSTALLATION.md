# Guia Completo de Instalação e Configuração

Este guia fornece instruções passo a passo para instalar e configurar o XMLTV Enricher com PM2.

## Pré-requisitos

Antes de começar, certifique-se de ter:

- **Node.js** (versão 16 ou superior)
- **npm** (geralmente instalado com Node.js)
- **PM2** (gerenciador de processos)
- **Acesso ao servidor** onde o Tvheadend está rodando
- **Acesso ao servidor** onde o Plex está rodando (pode ser o mesmo)

### Instalar Node.js e npm

Se você não tiver Node.js instalado, baixe-o em [https://nodejs.org/](https://nodejs.org/) ou instale via gerenciador de pacotes:

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install nodejs npm
```

**CentOS/RHEL:**
```bash
sudo yum install nodejs npm
```

### Instalar PM2 Globalmente

```bash
sudo npm install pm2 -g
```

---

## Etapa 1: Obter o Projeto

### Opção A: Clonar do Git

Se você tem o repositório no Git:

```bash
git clone <url_do_repositorio> /home/ubuntu/xmltv-enricher
cd /home/ubuntu/xmltv-enricher
```

### Opção B: Extrair do Arquivo ZIP

Se você recebeu um arquivo ZIP:

```bash
unzip xmltv-enricher.zip -d /home/ubuntu/
cd /home/ubuntu/xmltv-enricher
```

### Opção C: Copiar Manualmente

Copie todos os arquivos do projeto para um diretório em seu servidor:

```bash
mkdir -p /home/ubuntu/xmltv-enricher
cd /home/ubuntu/xmltv-enricher
# Copie os arquivos aqui
```

---

## Etapa 2: Instalar Dependências

No diretório do projeto, instale as dependências Node.js:

```bash
npm install
```

Isso instalará todos os pacotes necessários listados em `package.json`.

---

## Etapa 3: Configurar Variáveis de Ambiente

### Criar arquivo .env

Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

### Editar arquivo .env

Abra o arquivo `.env` em seu editor favorito:

```bash
nano .env
```

ou

```bash
vi .env
```

### Configurações Essenciais

Preencha as seguintes variáveis:

#### Tvheadend

```env
TVHEADEND_URL=http://localhost:9981
TVHEADEND_USERNAME=
TVHEADEND_PASSWORD=
```

- `TVHEADEND_URL`: URL do seu servidor Tvheadend (ex: `http://192.168.1.100:9981`)
- `TVHEADEND_USERNAME`: Usuário se o Tvheadend exigir autenticação
- `TVHEADEND_PASSWORD`: Senha se o Tvheadend exigir autenticação

#### APIs (Obtenha as chaves conforme descrito em SETUP_APIS.md)

```env
TVDB_API_KEY=sua_chave_aqui
TVDB_PIN=
TMDB_API_KEY=sua_chave_aqui
OMDB_API_KEY=sua_chave_aqui
```

Configure pelo menos uma API. Consulte [SETUP_APIS.md](./SETUP_APIS.md) para instruções detalhadas.

#### Agendamento

```env
SCHEDULE_INTERVAL_HOURS=12
```

Define com que frequência o enriquecimento será executado (em horas).

#### Saída

```env
OUTPUT_FILE_PATH=/home/ubuntu/xmltv-enricher/output/xmltv.xml
PLACEHOLDER_IMAGE_URL=https://raw.githubusercontent.com/seu-usuario/seu-repo/main/placeholder.jpg
```

- `OUTPUT_FILE_PATH`: Caminho onde o arquivo XML será salvo (deve ser acessível pelo Plex)
- `PLACEHOLDER_IMAGE_URL`: URL de uma imagem para usar quando nenhuma capa for encontrada

#### Logging

```env
LOG_LEVEL=info
LOG_FILE=/var/log/xmltv-enricher.log
```

---

## Etapa 4: Criar Diretórios Necessários

Crie os diretórios para saída e logs:

```bash
mkdir -p /home/ubuntu/xmltv-enricher/output
mkdir -p /var/log
```

Certifique-se de que o usuário que executará o PM2 tem permissão de escrita:

```bash
chmod 755 /home/ubuntu/xmltv-enricher/output
chmod 755 /var/log
```

---

## Etapa 5: Iniciar com PM2

### Iniciar a Aplicação

No diretório do projeto, execute:

```bash
pm2 start ecosystem.config.js
```

Você deve ver uma saída como:

```
[PM2] Spawning application name: xmltv-enricher
[PM2] App [xmltv-enricher] started
```

### Verificar Status

```bash
pm2 status
```

Você deve ver:

```
│ id │ name              │ namespace   │ version │ mode │ pid  │ uptime │ status  │
├────┼──────────────────┼─────────────┼─────────┼──────┼──────┼────────┼─────────┤
│ 0  │ xmltv-enricher   │ default     │ 1.0.0   │ fork │ 1234 │ 0s     │ online  │
```

### Ver Logs

```bash
pm2 logs xmltv-enricher
```

---

## Etapa 6: Configurar Inicialização Automática

Para que o aplicativo inicie automaticamente após reinicializar o servidor:

```bash
pm2 save
pm2 startup
```

Siga as instruções exibidas. Geralmente, você precisará executar um comando `sudo`.

---

## Etapa 7: Configurar Plex

Agora que o XMLTV Enricher está gerando o arquivo XML enriquecido, configure o Plex para usá-lo:

1. Abra as configurações do Plex
2. Vá para **Live TV & DVR** (ou **Biblioteca** → **Live TV**)
3. Clique em **Adicionar Fonte de TV**
4. Selecione **XMLTV**
5. Insira o caminho ou URL do arquivo gerado:
   - Se estiver na mesma máquina: `/home/ubuntu/xmltv-enricher/output/xmltv.xml`
   - Se estiver em outra máquina: `http://seu-servidor:porta/xmltv.xml`

---

## Verificação Final

### Verificar se o arquivo XML foi gerado

```bash
ls -lh /home/ubuntu/xmltv-enricher/output/xmltv.xml
```

### Validar XML

```bash
xmllint --noout /home/ubuntu/xmltv-enricher/output/xmltv.xml
```

### Verificar logs

```bash
pm2 logs xmltv-enricher --lines 50
```

---

## Comandos Úteis do PM2

| Comando | Descrição |
|---------|-----------|
| `pm2 start ecosystem.config.js` | Iniciar a aplicação |
| `pm2 stop xmltv-enricher` | Parar a aplicação |
| `pm2 restart xmltv-enricher` | Reiniciar a aplicação |
| `pm2 delete xmltv-enricher` | Remover a aplicação do PM2 |
| `pm2 status` | Ver status de todas as aplicações |
| `pm2 logs xmltv-enricher` | Ver logs em tempo real |
| `pm2 save` | Salvar configuração do PM2 |
| `pm2 startup` | Configurar inicialização automática |
| `pm2 unstartup` | Remover inicialização automática |

---

## Rollback / Desinstalação

Se precisar remover o XMLTV Enricher:

### 1. Parar a Aplicação

```bash
pm2 stop xmltv-enricher
```

### 2. Remover do PM2

```bash
pm2 delete xmltv-enricher
```

### 3. Remover Inicialização Automática

```bash
pm2 unstartup
```

### 4. Remover Diretório (Opcional)

```bash
rm -rf /home/ubuntu/xmltv-enricher
```

---

## Próximos Passos

1. Consulte [SETUP_APIS.md](./SETUP_APIS.md) para configurar as chaves de API
2. Consulte [README.md](./README.md) para mais informações sobre o projeto
3. Consulte [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) se encontrar problemas

---

## Suporte

Se encontrar problemas durante a instalação, consulte:

1. Os logs: `pm2 logs xmltv-enricher`
2. O arquivo [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
3. A documentação das APIs oficiais
