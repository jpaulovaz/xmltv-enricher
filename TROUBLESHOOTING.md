# Guia de Troubleshooting e FAQ

## Perguntas Frequentes

### P: O Plex não está lendo o arquivo XML gerado?

**R:** Verifique os seguintes pontos:

1. **Permissões de arquivo**: Certifique-se de que o Plex tem permissão de leitura no arquivo:
   ```bash
   chmod 644 /caminho/do/arquivo/xmltv.xml
   ```

2. **Caminho correto**: Verifique se o caminho em `OUTPUT_FILE_PATH` no `.env` está correto e acessível pelo Plex.

3. **Formato do arquivo**: O arquivo deve ser um XML válido. Verifique se não há erros no log:
   ```bash
   pm2 logs xmltv-enricher
   ```

4. **Configuração do Plex**: No Plex, certifique-se de que a URL ou caminho do arquivo XMLTV está configurado corretamente nas configurações de Live TV.

---

### P: Por que alguns programas não têm capas?

**R:** Existem várias razões:

1. **Programa não encontrado nas APIs**: Se o nome do programa não corresponder exatamente ao banco de dados, o sistema usará o placeholder.

2. **Placeholder não configurado**: Verifique se `PLACEHOLDER_IMAGE_URL` está preenchido no `.env`.

3. **APIs não configuradas**: Certifique-se de que pelo menos uma chave de API está configurada.

4. **Título muito genérico**: Títulos muito comuns podem gerar resultados incorretos. Considere adicionar o ano ao título.

---

### P: Como aumentar a velocidade de enriquecimento?

**R:** Você pode:

1. **Ativar cache**: Certifique-se de que `CACHE_ENABLED=true` no `.env`.

2. **Aumentar TTL do cache**: Aumente `CACHE_TTL_HOURS` para manter os resultados em cache por mais tempo.

3. **Reduzir frequência**: Se o enriquecimento está lento, aumente `SCHEDULE_INTERVAL_HOURS` para executar com menos frequência.

4. **Usar menos APIs**: Desative APIs que não estão sendo usadas (deixe a chave em branco).

---

### P: Como resetar o cache?

**R:** O cache é armazenado em memória e é automaticamente limpo quando o aplicativo é reiniciado:

```bash
pm2 restart xmltv-enricher
```

---

## Problemas Comuns

### Erro: "Nenhuma API está configurada"

**Solução:**
- Edite o arquivo `.env` e adicione pelo menos uma chave de API válida
- Reinicie o aplicativo:
  ```bash
  pm2 restart xmltv-enricher
  ```

---

### Erro: "Tvheadend URL não acessível"

**Solução:**
- Verifique se o Tvheadend está rodando e acessível
- Teste a URL manualmente:
  ```bash
  curl http://seu_tvheadend_url:9981/xmltv
  ```
- Verifique o firewall e permissões de rede
- Se usar autenticação, certifique-se de que `TVHEADEND_USERNAME` e `TVHEADEND_PASSWORD` estão corretos

---

### Erro: "Arquivo de saída não pode ser criado"

**Solução:**
- Verifique se o diretório de saída existe:
  ```bash
  mkdir -p /caminho/do/diretorio
  ```
- Verifique permissões:
  ```bash
  chmod 755 /caminho/do/diretorio
  ```
- Certifique-se de que o usuário que executa o PM2 tem permissão de escrita

---

### Erro: "Rate limit atingido"

**Solução:**
- O aplicativo aguardará automaticamente antes de tentar novamente
- Se isso acontecer frequentemente:
  1. Aumente `SCHEDULE_INTERVAL_HOURS` no `.env`
  2. Reduza a frequência de execução
  3. Ative o cache com TTL maior

---

### Logs vazios ou não aparecem

**Solução:**
- Verifique se o arquivo de log existe e tem permissões:
  ```bash
  ls -la /var/log/xmltv-enricher.log
  chmod 666 /var/log/xmltv-enricher.log
  ```
- Verifique o nível de log em `LOG_LEVEL` (use "debug" para mais detalhes)
- Veja os logs em tempo real:
  ```bash
  pm2 logs xmltv-enricher --lines 100
  ```

---

## Verificação de Saúde

### Verificar se o aplicativo está rodando

```bash
pm2 status
```

Você deve ver algo como:
```
│ id │ name              │ namespace   │ version │ mode │ pid  │ uptime │ status  │
├────┼──────────────────┼─────────────┼─────────┼──────┼──────┼────────┼─────────┤
│ 0  │ xmltv-enricher   │ default     │ 1.0.0   │ fork │ 1234 │ 2h     │ online  │
```

### Verificar logs recentes

```bash
pm2 logs xmltv-enricher --lines 50
```

### Verificar se o arquivo XML foi gerado

```bash
ls -lh /caminho/do/arquivo/xmltv.xml
```

### Validar XML

```bash
xmllint --noout /caminho/do/arquivo/xmltv.xml
```

---

## Limpeza e Reset

### Limpar cache de aplicação

```bash
pm2 restart xmltv-enricher
```

### Remover e reinstalar

```bash
pm2 delete xmltv-enricher
pm2 unstartup
cd /home/ubuntu/xmltv-enricher
npm install
pm2 start ecosystem.config.js
pm2 save
```

### Resetar arquivo .env para padrão

```bash
cp .env.example .env
```

---

## Contato e Suporte

Se encontrar um problema não listado aqui, verifique:

1. Os logs do aplicativo: `pm2 logs xmltv-enricher`
2. A documentação das APIs oficiais
3. O arquivo README.md do projeto

---

## Dicas de Performance

1. **Use cache**: Mantenha `CACHE_ENABLED=true`
2. **Ajuste intervalo**: Para grandes bibliotecas, use `SCHEDULE_INTERVAL_HOURS=24` ou mais
3. **Monitore logs**: Verifique regularmente se há erros ou warnings
4. **Atualize dependências**: Ocasionalmente, execute `npm update` para obter correções de segurança
