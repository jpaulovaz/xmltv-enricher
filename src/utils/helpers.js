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
  const categoryPrefix = /^(FILME|SERIE|SÉRIE|CINE|DOC|DESENHO|NOVELA|VISAO|VISÃO|PROGRAMAÇÃO|MISSA|TERÇO|EPISODIO|EPISÓDIO):\s*/i;
  cleaned = cleaned.replace(categoryPrefix, '');
  cleaned = cleaned.replace(/\s(\(?(HD|FHD|4K|3D|Dublado|Legendado)\)?)$/i, '');
  return cleaned.trim();
};

const cleanSeriesInfo = (title) => {
  if (!title) return '';
  return title
    .replace(/(?:\s*[-–]\s*|\s+)(?:(?:\d{1,2}[ªºa]?\s*)?(?:Temp(?:orada|\.)?|T\d+)|(?:Ep(?:is[oó]dio|\.)?\s*\d+)|(?:S\d+E\d+)|(?:Cap(?:[ií]tulo|\.)?\s*\d+)).*$/i, '')
    .trim();
};

// --- NOVIDADE: Extração de Metadados Local ---
const parseEpisodeInfo = (title) => {
  if (!title) return null;

  // Regex poderoso para pegar "S01 E02", "1ª Temp Ep 10", "Ep. 20"
  const regexes = [
    /(?:S|Temp\.?|Temporada)\s*(\d{1,2})(?:[ªºa])?.*(?:E|Ep\.?|Epis[oó]dio)\s*(\d{1,3})/i,
    /(?:Ep\.?|Epis[oó]dio|Cap\.?|Cap[ií]tulo)\s*(\d{1,4})/i
  ];

  for (const regex of regexes) {
    const match = title.match(regex);
    if (match) {
      if (match.length === 3) {
        // Tem Temporada e Episódio
        return {
          season: parseInt(match[1], 10),
          episode: parseInt(match[2], 10)
        };
      } else if (match.length === 2) {
        // Só tem Episódio (assume Season 1)
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
  // O formato xmltv_ns é chato: "S-1 . E-1 ." (Base zero)
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
  parseEpisodeInfo, // Exportando novo
  convertToXmltvNs  // Exportando novo
};