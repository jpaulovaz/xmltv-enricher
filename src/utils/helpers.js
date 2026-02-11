const normalizeTitle = (title) => {
  if (!title) return '';
  return title
    .replace(/^["']|["']$/g, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s]/g, ' ')     // Remove caracteres especiais
    .replace(/\s+/g, ' ')             // Remove espaços duplos
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
  let cleaned = title.replace(/^["']|["']$/g, '').trim();

  // Remove prefixos comuns de EPG (Case Insensitive)
  const categoryPrefix = /^(FILME|SERIE|SÉRIE|CINE|DOC|DESENHO|NOVELA|VISAO|VISÃO|PROGRAMAÇÃO|MISSA|TERÇO|EPISODIO|EPISÓDIO):\s*/i;
  cleaned = cleaned.replace(categoryPrefix, '');

  // Remove sufixos de qualidade/formato que atrapalham a busca
  cleaned = cleaned.replace(/\s(\(?(HD|FHD|4K|3D|Dublado|Legendado)\)?)$/i, '');

  return cleaned.trim();
};

// A MÁGICA ACONTECE AQUI: Regex robusto para cortar temporadas e episódios
const cleanSeriesInfo = (title) => {
  if (!title) return '';

  // Padrões para remover:
  // - " - 1ª Temp"
  // - " S01E01"
  // - " Ep. 10"
  // - " - Temporada 1"
  // - " (2023)" no final se não for parte do nome
  return title
    .replace(/(?:\s*[-–]\s*|\s+)(?:(?:\d{1,2}[ªºa]?\s*)?(?:Temp(?:orada|\.)?|T\d+)|(?:Ep(?:is[oó]dio|\.)?\s*\d+)|(?:S\d+E\d+)|(?:Cap(?:[ií]tulo|\.)?\s*\d+)).*$/i, '')
    .trim();
};

const extractTitleParts = (title) => {
  if (!title) return [null, null, null];
  const parts = title.split(':').map(p => p.trim());
  return [
    title,
    parts[0] || null,
    parts.slice(1).join(':') || null
  ];
};

module.exports = {
  normalizeTitle,
  generateCacheKey,
  extractYearFromTitle,
  extractCleanTitle,
  cleanSeriesInfo,
  extractTitleParts
};