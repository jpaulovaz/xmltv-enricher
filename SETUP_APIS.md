# Guia de Configuração das APIs

Este documento fornece instruções passo a passo para obter as chaves de API necessárias para o XMLTV Enricher.

## TVDb (The TV Database)

### Por que usar TVDb?

A TVDb é a base de dados mais completa para séries de TV, com excelente cobertura de metadados, capas e informações de episódios.

### Obter Chave de API

1. Acesse [https://www.thetvdb.com/api-information/signup](https://www.thetvdb.com/api-information/signup)
2. Faça login ou crie uma conta (gratuita)
3. Navegue até seu Dashboard
4. No menu esquerdo, clique em **Account** → **API Keys**
5. Clique em **Create New API Key**
6. Preencha o formulário com informações sobre seu projeto
7. Aceite os termos de uso
8. Sua chave de API será exibida

### Configurar no .env

```env
TVDB_API_KEY=sua_chave_aqui
TVDB_PIN=  # Deixe em branco se não tiver PIN de usuário
```

**Nota:** Se você tiver um PIN de usuário (para acesso a conteúdo premium), adicione-o também. Caso contrário, deixe em branco.

---

## TMDb (The Movie Database)

### Por que usar TMDb?

A TMDb oferece excelente cobertura de filmes e séries, com capas de alta qualidade e informações detalhadas de gêneros.

### Obter Chave de API

1. Acesse [https://www.themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
2. Faça login ou crie uma conta (gratuita)
3. Clique em **API** no menu esquerdo
4. Clique em **Create** ou **Request an API Key**
5. Selecione o tipo de uso (geralmente "Developer")
6. Preencha o formulário com informações sobre seu projeto
7. Aceite os termos de uso
8. Sua chave de API será exibida

### Configurar no .env

```env
TMDB_API_KEY=sua_chave_aqui
```

---

## OMDb (Open Movie Database)

### Por que usar OMDb?

O OMDb fornece dados do IMDb e é útil como fallback quando as outras APIs não encontram informações.

### Obter Chave de API

1. Acesse [http://www.omdbapi.com/apikey.aspx](http://www.omdbapi.com/apikey.aspx)
2. Preencha o formulário com seu email
3. Escolha o plano (gratuito ou pago)
4. Você receberá a chave de API por email dentro de uma hora

### Configurar no .env

```env
OMDB_API_KEY=sua_chave_aqui
```

---

## Configuração Recomendada

Para melhor cobertura e performance, configure todas as três APIs:

```env
# TVDb - Melhor para séries
TVDB_API_KEY=sua_chave_tvdb
TVDB_PIN=

# TMDb - Melhor para filmes e séries em geral
TMDB_API_KEY=sua_chave_tmdb

# OMDb - Fallback
OMDB_API_KEY=sua_chave_omdb
```

**Ordem de Prioridade:**
1. TVDb (melhor para séries)
2. TMDb (boa cobertura geral)
3. OMDb (fallback)

---

## Testando as Chaves

Após configurar as chaves no arquivo `.env`, você pode testar se estão funcionando corretamente iniciando o aplicativo:

```bash
npm run dev
```

O aplicativo exibirá mensagens indicando quais APIs foram inicializadas com sucesso:

```
✓ TVDb API inicializada
✓ TMDb API inicializada
✓ OMDb API inicializada
```

Se alguma chave estiver inválida ou não configurada, o aplicativo continuará funcionando com as APIs disponíveis.

---

## Limites de Taxa (Rate Limits)

Cada API tem limites de requisições:

| API | Limite Gratuito | Período |
|-----|-----------------|---------|
| TVDb | 30 requisições | 10 segundos |
| TMDb | 40 requisições | 10 segundos |
| OMDb | 1.000 requisições | Dia |

O XMLTV Enricher implementa tratamento automático de rate limits, aguardando e retentando quando necessário.

---

## Solução de Problemas

### "API Key inválida"

- Verifique se copiou a chave corretamente (sem espaços extras)
- Certifique-se de que a chave está no arquivo `.env` correto
- Tente regenerar a chave no site da API

### "Nenhuma API está configurada"

- Certifique-se de que pelo menos uma chave de API está preenchida no `.env`
- Reinicie o aplicativo após editar o `.env`

### "Rate limit atingido"

- O aplicativo aguardará automaticamente antes de tentar novamente
- Se isso acontecer frequentemente, considere aumentar o intervalo de execução em `SCHEDULE_INTERVAL_HOURS`

---

## Próximos Passos

Após configurar as chaves de API, consulte o [README.md](./README.md) para instruções de instalação e execução do aplicativo.
