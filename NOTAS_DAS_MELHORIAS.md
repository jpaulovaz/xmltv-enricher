# Melhorias aplicadas no xmltv-enricher

## Objetivo
Reduzir falso positivo, preservar títulos corretos com hífen/subtítulo, separar itens elegíveis dos que devem ser ignorados e corrigir a escrita de rating/score no XML.

## Arquivos alterados
- src/utils/helpers.js
- src/utils/fuzzyMatcher.js
- src/services/matchingService.js
- src/services/cacheService.js
- src/services/statsService.js
- src/enricher.js
- src/apis/tmdb.js
- src/apis/omdb.js
- src/apis/tvdb.js
- src/apis/plex.js
- src/apis/plexdb.js
- src/apis/imdb.js

## O que mudou
1. **Títulos preservados e variantes mais seguras**
   - O app não corta mais qualquer coisa após hífen ou parêntese.
   - Agora ele gera variantes de busca ordenadas, mantendo o título completo e só depois tentando versões reduzidas.
   - Casos como `Van Helsing - O Caçador De Monstros`, `A Saga Crepúsculo: Amanhecer - Parte 2` e `D.P.A. - Detetives Do Prédio Azul - 19ª Temp. Ep. 21` deixam de ser mutilados no caminho principal.

2. **Dicionário menos destrutivo**
   - Prefixos do `cleaner_dictionary.txt` só são removidos quando aparecem com separadores mais seguros (`:`, `-`, etc.).
   - Isso evita erros como `Visão Crítica -> Crítica`.

3. **Heurísticas para ignorar conteúdos que só geravam match errado**
   - Jogos/eventos esportivos
   - Blocos de notícias/ao vivo
   - placeholders como `Dia 11/02`, `Programação`, etc.
   - Esses itens passam a receber placeholder sem contaminar a taxa de acerto.

4. **Score de match recalibrado**
   - Saiu o bônus cego de `+20` para matches fracos.
   - Entrou um score composto por similaridade + overlap de tokens + cobertura de tokens.
   - O score também considera suporte do título original, ano e tipo esperado (`movie` x `series`).
   - Acrônimos/aliases exatos como `D.P.A.` agora são aceitos sem serem punidos injustamente.

5. **Cache mais contextual**
   - A chave do cache agora inclui contexto de canal/tipo quando disponível.
   - Isso reduz colisões entre títulos iguais em contextos diferentes.

6. **Métrica de efetividade mais honesta**
   - Separação entre:
     - total processado
     - elegíveis para busca
     - enriquecidos
     - ignorados por heurística
     - rejeitados por baixa confiança
     - não encontrados
   - Agora o indicador principal fica muito menos inflado ou injustamente punido por esportes/news/placeholders.

7. **Correção de rating no XML**
   - Antes o app jogava `imdbRating`/`vote_average` dentro de `<rating>` como se fosse classificação indicativa.
   - Agora:
     - classificação indicativa vai em `rating`
     - nota vai em `star-rating`

8. **episode-num menos errado**
   - O parser agora extrai temporada/episódio melhor.
   - Quando só há episódio, ele deixa o `xmltv_ns` com temporada desconhecida em vez de inventar temporada 1.

9. **PlexDB menos arriscado**
   - A consulta foi endurecida para priorizar match exato e respeitar melhor tipo/ano.
   - O retorno deixa de marcar tudo como `movie`.

## Validação rápida recomendada
1. Rodar em dry-run.
2. Comparar `stats.json` antes/depois.
3. Conferir no CSV de auditoria principalmente:
   - `Van Helsing - O Caçador De Monstros`
   - `Demolidor - O Homem Sem Medo`
   - `A Saga Crepúsculo: Amanhecer - Parte 2`
   - `D.P.A. - Detetives Do Prédio Azul - 19ª Temp. Ep. 21`
   - notícias/esportes que antes davam falso positivo.

## Observação importante
Essas mudanças melhoram bastante a **precisão** e a qualidade da métrica. Elas não substituem uma fonte de EPG por canal/horário. Para chegar mais perto do comportamento do Plex automático, o próximo passo ideal continua sendo trabalhar uma fonte de guia melhor e usar o enriquecimento só como complemento.
