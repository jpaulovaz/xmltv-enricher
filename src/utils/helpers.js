const fs = require('fs');
const path = require('path');
// Precisamos do logger para os avisos de recarregamento
const logger = require('./logger');

// --- ESTADO GLOBAL DO DICIONÁRIO ---
let dictionaryRegex = null;

// Função interna para processar o conteúdo e criar a Regex Otimizada
function buildDictionaryRegex(content) {
  const lines = content.split('\n')
    .map(line => line.trim())
    // Remove comentários (#) e linhas vazias
    .filter(line => line.length > 0 && !line.startsWith('#'))
    // IMPORTANTE: Ordena do maior para o menor para evitar matches parciais incorretos
    // Ex: "Especial Telecine" será testado antes de "Especial"
    .sort((a, b) => b.length - a.length)
    // Escapa caracteres especiais de regex
    .map(line => line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (lines.length > 0) {
    // Cria a Regex: ^(Palavra1|Palavra2|...)(:|\s)+
    return new RegExp(`^(${lines.join('|')})[:\\s]+`, 'i');
  }
  return null;
}

// Carregamento Inicial
try {
  const dictPath = path.join(process.cwd(), 'src', 'config', 'cleaner_dictionary.txt');
  if (fs.existsSync(dictPath)) {
    const content = fs.readFileSync(dictPath, 'utf-8');
    dictionaryRegex = buildDictionaryRegex(content);
    // logger.info('Dicionário de limpeza carregado e ordenado.');
  }
} catch (error) {
  logger.warn(`Aviso: Não foi possível carregar cleaner_dictionary.txt: ${error.message}`);
}

// Função para recarregar o dicionário (Usada pela API/Web)
function reloadDictionary() {
  try {
    const dictPath = path.join(process.cwd(), 'src', 'config', 'cleaner_dictionary.txt');
    if (fs.existsSync(dictPath)) {
      const content = fs.readFileSync(dictPath, 'utf-8');
      dictionaryRegex = buildDictionaryRegex(content);
      logger.info('📖 Dicionário recarregado e reordenado na memória com sucesso.');
      return true;
    }
  } catch (error) {
    logger.error(`Erro ao recarregar dicionário: ${error.message}`);
  }
  return false;
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
    // Fallback de segurança caso o dicionário esteja vazio
    const fallbackPrefix = /^(FILME|SERIE|SÉRIE|EPISODIO|EPISÓDIO):\s*/i;
    cleaned = cleaned.replace(fallbackPrefix, '');
  }

  // 3. Remove sufixos técnicos
  cleaned = cleaned.replace(/\s(\(?(HD|FHD|4K|3D|Dublado|Legendado)\)?)$/i, '');

  // 4. CORREÇÃO DO HÍFEN
  const splitRegex = /(\s+[-–]\s+|\s*\()/;
  cleaned = cleaned.split(splitRegex)[0];

  return cleaned.trim();
};

const cleanSeriesInfo = (title) => {
  if (!title) return '';
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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  normalizeTitle,
  generateCacheKey,
  extractYearFromTitle,
  extractCleanTitle,
  cleanSeriesInfo,
  parseEpisodeInfo,
  convertToXmltvNs,
  reloadDictionary, // Nova função exportada
  sleep
};