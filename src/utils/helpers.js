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
  let cleaned = title.replace(/^["']|["']$/g, '').trim();
  const categoryPrefix = /^(FILME|SERIE|CINE|DOC|DESENHO|NOVELA|VISAO|PROGRAMAÇÃO|MISSA|TERÇO):\s*/i;
  cleaned = cleaned.replace(categoryPrefix, '');
  return cleaned.trim();
};

const cleanSeriesInfo = (title) => {
  if (!title) return '';
  return title
    .split(/\s-\s(Ep\.|Episódio|Temp\.|Temporada|\d+ª)/i)[0]
    .replace(/\s*-\s*.*$/, '')
    .trim();
};

module.exports = {
  normalizeTitle,
  generateCacheKey,
  extractYearFromTitle,
  extractCleanTitle,
  cleanSeriesInfo
};