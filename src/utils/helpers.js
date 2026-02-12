const fs = require('fs');
const path = require('path');

// --- CARREGAMENTO DO DICIONÁRIO ---
let dictionaryRegex = null;

try {
  const dictPath = path.join(process.cwd(), 'cleaner_dictionary.txt');
  if (fs.existsSync(dictPath)) {
    const lines = fs.readFileSync(dictPath, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      // Remove comentários (#) e linhas vazias
      .filter(line => line.length > 0 && !line.startsWith('#'))
      // Escapa caracteres especiais de regex para evitar erros
      .map(line => line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    if (lines.length > 0) {
      // Cria um Regex gigante: ^(Palavra1|Palavra2|...)(:|\s)+
      // Isso busca qualquer uma das palavras no INÍCIO, seguida de dois pontos ou espaço
      dictionaryRegex = new RegExp(`^(${lines.join('|')})[:\\s]+`, 'i');
      // console.log('Dicionário de limpeza carregado com sucesso.'); // (Opcional, comentado para não poluir log)
    }
  }
} catch (error) {
  console.error(`Aviso: Não foi possível carregar cleaner_dictionary.txt: ${error.message}`);
}

// ----------------------------------

const normalizeTitle = (title) => {
  if (!title) return '';
  return title
    .replace(/^["']|["']$/g, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const generateCacheKey = (title, year) => {
  const normalized = normalizeTitle(title);
  return year ? `${normalized}_${year}` : normalized;
};

const extractYearFromTitle = (title) => {
  if (!title) return null;
  const yearMatch = title.match(/\((\d{4})\)/);
  return yearMatch ? parseInt(yearMatch[1], 10) : null;
};

const extractCleanTitle = (title) => {
  if (!title) return '';

  // 1. Remove aspas
  let cleaned = title.replace(/^["']|["']$/g, '').trim();

  // 2. Aplica o DICIONÁRIO (Remove prefixos indesejados)
  if (dictionaryRegex) {
    cleaned = cleaned.replace(dictionaryRegex, '');
  } else {
    // Fallback: Se o arquivo não existir, usa o básico hardcoded (segurança)
    const fallbackPrefix = /^(FILME|SERIE|SÉRIE|EPISODIO|EPISÓDIO):\s*/i;
    cleaned = cleaned.replace(fallbackPrefix, '');
  }

  // 3. Remove sufixos técnicos (HD, FHD, 4K, Dublado...)
  cleaned = cleaned.replace(/\s(\(?(HD|FHD|4K|3D|Dublado|Legendado)\)?)$/i, '');

  // 4. CORREÇÃO DO HÍFEN (Ajuste Crítico da Auditoria)
  // ANTES: Cortava em qualquer hifen (-). Ex: "Homem-Aranha" virava "Homem".
  // AGORA: Corta apenas se tiver espaço antes OU for parenteses.
  // Ex: "Homem-Aranha" -> Mantém "Homem-Aranha"
  // Ex: "Matrix - O Filme" -> Vira "Matrix"
  // Ex: "Batman (1989)" -> Vira "Batman"
  const splitRegex = /(\s+[-–]\s+|\s*\()/;
  cleaned = cleaned.split(splitRegex)[0];

  return cleaned.trim();
};

const cleanSeriesInfo = (title) => {
  if (!title) return '';

  // Regex Turbinado:
  // 1. Procura separadores como " - ", " : " ou espaço
  // 2. Procura indicadores de temporada/episódio (T1, S01, Ep, Cap, Temp)
  // 3. Corta tudo dali pra frente.
  return title
    .replace(/(?:\s+(?:[-–:]\s+)?)(?:(?:\d{1,2}[ªºa]?\s*)?(?:Temp(?:orada|\.)?|T\d+)|(?:Ep(?:is[oó]dio|\.)?\s*\d+)|(?:S\d+E\d+)|(?:Cap(?:[ií]tulo|\.)?\s*\d+)).*$/i, '')
    .trim();
};

const parseEpisodeInfo = (title) => {
  if (!title) return null;

  const regexes = [
    /(?:S|Temp\.?|Temporada)\s*(\d{1,2})(?:[ªºa])?.*(?:E|Ep\.?|Epis[oó]dio)\s*(\d{1,3})/i,
    /(?:Ep\.?|Epis[oó]dio|Cap\.?|Cap[ií]tulo)\s*(\d{1,4})/i
  ];

  for (const regex of regexes) {
    const match = title.match(regex);
    if (match) {
      if (match.length === 3) {
        return {
          season: parseInt(match[1], 10),
          episode: parseInt(match[2], 10)
        };
      } else if (match.length === 2) {
        return {
          season: 1,
          episode: parseInt(match[1], 10)
        };
      }
    }
  }
  return null;
};

const convertToXmltvNs = (season, episode) => {
  const s = season > 0 ? season - 1 : 0;
  const e = episode > 0 ? episode - 1 : 0;
  return `${s}.${e}.`;
};

module.exports = {
  normalizeTitle,
  generateCacheKey,
  extractYearFromTitle,
  extractCleanTitle,
  cleanSeriesInfo,
  parseEpisodeInfo,
  convertToXmltvNs
};