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

  // Remove prefixos comuns
  const categoryPrefix = /^(FILME|SERIE|SÉRIE|CINE|DOC|DESENHO|NOVELA|VISAO|VISÃO|PROGRAMAÇÃO|MISSA|TERÇO|EPISODIO|EPISÓDIO):\s*/i;
  cleaned = cleaned.replace(categoryPrefix, '');

  return cleaned.trim();
};

const cleanSeriesInfo = (title) => {
  if (!title) return '';

  // ALVO: "Nome - 7ª Temp. Ep. 362" ou "Nome - Ep. 21"
  // Remove tudo a partir de " - " seguido de número+Temp ou Ep
  return title
    .replace(/\s+-\s+\d+ª\s+Temp\..*$/i, '') // Remove "- 7ª Temp..."
    .replace(/\s+-\s+Ep\..*$/i, '')          // Remove "- Ep. 21..."
    .replace(/\s+-\s+Temporada.*$/i, '')     // Remove "- Temporada..."
    .replace(/\s+-\s+T\d+.*$/i, '')          // Remove "- T1..."
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