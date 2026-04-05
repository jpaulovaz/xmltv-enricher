const fs = require('fs');
const path = require('path');
const logger = require('./logger');

let dictionaryRegex = null;

const TECHNICAL_SUFFIX_REGEX = /(?:\s*(?:\(|\[)?(?:HD|FHD|UHD|4K|3D|DUBLADO|LEGENDADO|DUAL[\s-]?A[ÁA]UDIO|AUDIO[\s-]?DESCRI[CÇ][AÃ]O|REPRISE|ESTREIA)(?:\)|\])?)+$/i;
const DECORATIVE_TRAILING_SEGMENT_REGEX = /^(?:\d{1,2}[ªºa]?\s*temp(?:orada|\.)?.*|t\s*\d+\s*e\s*\d+.*|s\s*\d+\s*e\s*\d+.*|ep(?:is[oó]dio|\.)?\s*\d+.*|cap(?:[ií]tulo|\.)?\s*\d+.*|ao vivo|reprise|estreia|compacto|melhores momentos|edi[cç][aã]o especial|dia\s*\d{1,2}\/\d{1,2})$/i;
const MATCHUP_REGEX = /[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9'.&\- ]{1,40}\s+[xX]\s+[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9'.&\- ]{1,40}/;
const SPORTS_KEYWORDS_REGEX = /\b(libertadores|sulamericana|champions|premier\s+league|nba|nfl|mlb|nhl|ufc|rugby|basquete|futebol|volei|v[oô]lei|tenis|t[êe]nis|formula\s*1|f1|copa\s+do\s+rei|copa\s+do\s+brasil|brasileir[aã]o|paulist[aã]o|carioc[aã]o|superliga|sportv|premiere|conmebol)\b/i;
const NEWS_KEYWORDS_REGEX = /\b(ao\s+vivo|jornal|boletim|news|not[ií]cias?|debate|mercado|meio\s+do\s+dia|manh[aã]|urgente|plant[aã]o|edi[cç][aã]o)\b/i;
const GENERIC_BLOCK_REGEX = /^(?:programa[cç][aã]o|intervalo|encerramento|missa|culto|leil[aã]o|hor[oó]scopo|dia\s+\d{1,2}\/\d{1,2})\b/i;
const SERIES_HINT_CATEGORY_REGEX = /\b(soap|series|s[eé]rie|kids|children|anime)\b/i;

function buildDictionaryRegex(content) {
  const lines = content.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .sort((a, b) => b.length - a.length)
    .map(line => line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (lines.length > 0) {
    return new RegExp(`^(${lines.join('|')})(?:\\s*[:\\-–]\\s+|\\s{2,})`, 'i');
  }
  return null;
}

try {
  const dictPath = path.join(process.cwd(), 'src', 'config', 'cleaner_dictionary.txt');
  if (fs.existsSync(dictPath)) {
    const content = fs.readFileSync(dictPath, 'utf-8');
    dictionaryRegex = buildDictionaryRegex(content);
  }
} catch (error) {
  logger.warn(`Aviso: Não foi possível carregar cleaner_dictionary.txt: ${error.message}`);
}

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

const normalizeWhitespace = (value) => (value || '').replace(/\s+/g, ' ').trim();

const decodeHtmlEntities = (value) => {
  if (!value || typeof value !== 'string') return '';

  const namedEntities = {
    amp: '&',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    hellip: '...',
    mdash: '-',
    ndash: '-',
    lsquo: "'",
    rsquo: "'",
    ldquo: '"',
    rdquo: '"'
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (namedEntities[lower]) return namedEntities[lower];

    if (lower.startsWith('#x')) {
      const code = parseInt(lower.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }

    if (lower.startsWith('#')) {
      const code = parseInt(lower.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }

    return match;
  });
};

const normalizeTitle = (title) => {
  if (!title) return '';
  return decodeHtmlEntities(title)
    .replace(/^\s*["']|["']\s*$/g, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const generateCacheKey = (title, year, context = {}) => {
  const ctx = typeof context === 'string' ? { channel: context } : (context || {});
  const normalized = normalizeTitle(title);
  const normalizedChannel = normalizeTitle(ctx.channel || '');
  const normalizedType = normalizeTitle(ctx.expectedType || '');
  const parts = [normalized];

  if (year) parts.push(String(year));
  if (normalizedChannel) parts.push(`ch:${normalizedChannel}`);
  if (normalizedType) parts.push(`tp:${normalizedType}`);

  return parts.join('__');
};

const extractYearFromTitle = (title) => {
  if (!title) return null;
  const yearMatch = decodeHtmlEntities(title).match(/\((\d{4})\)/);
  return yearMatch ? parseInt(yearMatch[1], 10) : null;
};

const stripDictionaryPrefix = (title) => {
  if (!title) return '';

  let cleaned = title;
  if (dictionaryRegex) {
    cleaned = cleaned.replace(dictionaryRegex, '');
  } else {
    const fallbackPrefix = /^(FILME|SERIE|SÉRIE|EPISODIO|EPISÓDIO)\s*[:\-–]\s*/i;
    cleaned = cleaned.replace(fallbackPrefix, '');
  }

  return normalizeWhitespace(cleaned);
};

const stripTechnicalSuffixes = (title) => {
  if (!title) return '';

  let cleaned = title;
  let previous = null;

  while (cleaned !== previous) {
    previous = cleaned;
    cleaned = cleaned
      .replace(TECHNICAL_SUFFIX_REGEX, '')
      .replace(/\s*\((?:HD|FHD|UHD|4K|3D|Dublado|Legendado|Dual[\s-]?Áudio|Audiodescrição)\)\s*$/i, '')
      .trim();
  }

  return normalizeWhitespace(cleaned);
};

const stripLastDecorativeSegment = (title) => {
  if (!title) return '';

  const cleaned = normalizeWhitespace(title);
  const parts = cleaned.split(/\s+[-–]\s+/).map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return cleaned;

  const lastSegment = parts[parts.length - 1];
  if (DECORATIVE_TRAILING_SEGMENT_REGEX.test(lastSegment)) {
    return normalizeWhitespace(parts.slice(0, -1).join(' - '));
  }

  return cleaned;
};

const cleanSeriesInfo = (title) => {
  if (!title) return '';

  return normalizeWhitespace(
    decodeHtmlEntities(title)
      .replace(/(?:\s+(?:[-–:]\s+)?)((?:\d{1,2}[ªºa]?\s*)?(?:Temp(?:orada|\.)?|T\d+)|(?:Ep(?:is[oó]dio|\.)?\s*\d+)|(?:S\d+E\d+)|(?:Cap(?:[ií]tulo|\.)?\s*\d+)).*$/i, '')
      .replace(/\s+\((?:\d{4}|HD|FHD|UHD|4K|3D|Dublado|Legendado)\)\s*$/i, '')
  );
};

const extractCleanTitle = (title) => {
  if (!title) return '';

  let cleaned = decodeHtmlEntities(title).replace(/^\s*["']|["']\s*$/g, '').trim();
  cleaned = stripDictionaryPrefix(cleaned);
  cleaned = stripTechnicalSuffixes(cleaned);
  cleaned = stripLastDecorativeSegment(cleaned);
  cleaned = cleanSeriesInfo(cleaned);
  cleaned = cleaned.replace(/\s+\((\d{4})\)\s*$/i, '').trim();

  return normalizeWhitespace(cleaned);
};

const looksLikeShortAlias = (title) => {
  if (!title) return false;
  const normalized = normalizeWhitespace(title);
  return normalized.length <= 6 || /\./.test(normalized) || /^[A-Z0-9]{2,6}$/i.test(normalized.replace(/\s+/g, ''));
};

const buildTitleSearchCandidates = (title) => {
  const candidates = [];
  const seen = new Set();

  const addCandidate = (value) => {
    const normalized = normalizeTitle(value);
    if (!normalized || normalized.length < 2 || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalizeWhitespace(decodeHtmlEntities(value)));
  };

  const rawTitle = normalizeWhitespace(decodeHtmlEntities(title));
  if (!rawTitle) return candidates;

  const noSeries = cleanSeriesInfo(rawTitle);
  const cleanRaw = extractCleanTitle(rawTitle);
  const cleanNoSeries = extractCleanTitle(noSeries);
  const withoutDecorativeSegment = stripLastDecorativeSegment(cleanNoSeries || noSeries || rawTitle);
  const noYear = normalizeWhitespace((cleanNoSeries || cleanRaw || rawTitle).replace(/\s+\((\d{4})\)\s*$/i, ''));

  addCandidate(rawTitle);
  addCandidate(noSeries);
  addCandidate(cleanRaw);
  addCandidate(cleanNoSeries);
  addCandidate(withoutDecorativeSegment);
  addCandidate(noYear);

  const hyphenParts = withoutDecorativeSegment.split(/\s+[-–]\s+/).map(part => part.trim()).filter(Boolean);
  if (hyphenParts.length >= 2) {
    const firstPart = hyphenParts[0];
    const secondPart = hyphenParts[1] || '';

    if (looksLikeShortAlias(firstPart)) {
      addCandidate(firstPart);
    } else if (hyphenParts.length === 2 && firstPart.length >= 4 && secondPart.length >= 4) {
      addCandidate(firstPart);
    }
  }

  return candidates;
};

const getProgrammeTextField = (field) => {
  if (!field) return '';
  if (Array.isArray(field) && field.length > 0) {
    const first = field[0];
    if (typeof first === 'object' && first !== null && first._) return first._;
    return first || '';
  }
  if (typeof field === 'object' && field !== null && field._) return field._;
  return field || '';
};

const getProgrammeCategories = (programme) => {
  if (!programme || !Array.isArray(programme.category)) return [];
  return programme.category
    .map(item => (typeof item === 'object' && item !== null ? item._ : item))
    .filter(Boolean)
    .map(value => normalizeWhitespace(String(value)));
};

const parseEpisodeInfo = (title) => {
  if (!title) return null;

  const normalizedTitle = decodeHtmlEntities(title);
  const regexes = [
    /(?:S|T)\s*(\d{1,2})\s*(?:E|EP)\s*(\d{1,3})/i,
    /(?:\d{1,2})\s*[ªºa]?\s*(?:Temp\.?|Temporada).*?(?:Ep\.?|Epis[oó]dio|Cap\.?|Cap[ií]tulo)\s*(\d{1,3})/i,
    /(?:Temp\.?|Temporada)\s*(\d{1,2})(?:[ªºa])?.*?(?:E|Ep\.?|Epis[oó]dio|Cap\.?|Cap[ií]tulo)\s*(\d{1,3})/i,
    /(?:Ep\.?|Epis[oó]dio|Cap\.?|Cap[ií]tulo)\s*(\d{1,4})/i
  ];

  for (const regex of regexes) {
    const match = normalizedTitle.match(regex);
    if (!match) continue;

    if (match.length === 3) {
      return {
        season: parseInt(match[1], 10),
        episode: parseInt(match[2], 10)
      };
    }

    if (match.length === 2) {
      const fullMatch = match[0] || '';
      const seasonMatch = fullMatch.match(/(?:Temp\.?|Temporada)\s*(\d{1,2})|(?:^|\s)(\d{1,2})\s*[ªºa]?\s*(?:Temp\.?|Temporada)/i);
      const seasonValue = seasonMatch ? parseInt(seasonMatch[1] || seasonMatch[2], 10) : null;
      return {
        season: Number.isInteger(seasonValue) ? seasonValue : null,
        episode: parseInt(match[1], 10)
      };
    }
  }

  return null;
};

const convertToXmltvNs = (season, episode) => {
  if (!Number.isInteger(episode) || episode <= 0) return null;

  const e = episode - 1;
  if (!Number.isInteger(season) || season <= 0) {
    return `.${e}.`;
  }

  const s = season - 1;
  return `${s}.${e}.`;
};

const detectProgrammeContext = (programme, channelName = '') => {
  const rawTitle = normalizeWhitespace(decodeHtmlEntities(getProgrammeTextField(programme?.title)));
  const normalizedTitle = normalizeTitle(rawTitle);
  const categories = getProgrammeCategories(programme);
  const normalizedCategories = categories.map(normalizeTitle);
  const epInfo = parseEpisodeInfo(rawTitle);
  const hasExistingEpisodeNum = Array.isArray(programme?.['episode-num']) && programme['episode-num'].length > 0;
  const hasSubTitle = Boolean(getProgrammeTextField(programme?.['sub-title']));

  let skipReason = null;

  if (GENERIC_BLOCK_REGEX.test(rawTitle)) {
    skipReason = 'generic_schedule';
  } else if (MATCHUP_REGEX.test(rawTitle) || normalizedCategories.some(cat => cat.includes('sport')) || SPORTS_KEYWORDS_REGEX.test(normalizedTitle)) {
    skipReason = 'sports_or_live_event';
  } else if (
    (normalizedCategories.some(cat => cat.includes('news')) || normalizedCategories.some(cat => cat.includes('talk show')) || NEWS_KEYWORDS_REGEX.test(normalizedTitle)) &&
    !epInfo &&
    !extractYearFromTitle(rawTitle)
  ) {
    skipReason = 'news_or_live_block';
  }

  let expectedType = null;
  if (epInfo || hasExistingEpisodeNum || hasSubTitle || normalizedCategories.some(cat => SERIES_HINT_CATEGORY_REGEX.test(cat))) {
    expectedType = 'series';
  }

  return {
    originalTitle: rawTitle,
    normalizedTitle,
    categories,
    expectedType,
    episodeInfo: epInfo,
    shouldSearch: !skipReason,
    skipReason,
    channelName: channelName || ''
  };
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
  reloadDictionary,
  sleep,
  decodeHtmlEntities,
  stripLastDecorativeSegment,
  buildTitleSearchCandidates,
  detectProgrammeContext,
  getProgrammeTextField,
  getProgrammeCategories,
  stripTechnicalSuffixes
};
