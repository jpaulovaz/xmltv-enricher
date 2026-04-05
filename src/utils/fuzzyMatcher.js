const logger = require('./logger');

/**
 * Módulo de Fuzzy Matching para validação de confiança de matches
 * Suporta múltiplos algoritmos: levenshtein, jaro_winkler, cosine
 */
class FuzzyMatcher {
  constructor(algorithm = 'jaro_winkler', threshold = 85) {
    this.algorithm = algorithm.toLowerCase();
    this.threshold = threshold;

    // Validar algoritmo
    if (!['levenshtein', 'jaro_winkler', 'cosine'].includes(this.algorithm)) {
      logger.warn(`Algoritmo desconhecido: ${algorithm}. Usando jaro_winkler`);
      this.algorithm = 'jaro_winkler';
    }
  }

  /**
   * Calcular similaridade entre duas strings
   * Retorna score entre 0 e 100
   */
  calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    // Normalizar strings
    const s1 = this._normalize(str1);
    const s2 = this._normalize(str2);

    // Se forem iguais após normalização, retornar 100
    if (s1 === s2) return 100;

    let score = 0;

    switch (this.algorithm) {
      case 'levenshtein':
        score = this._levenshteinSimilarity(s1, s2);
        break;
      case 'jaro_winkler':
        score = this._jaroWinklerSimilarity(s1, s2);
        break;
      case 'cosine':
        score = this._cosineSimilarity(s1, s2);
        break;
      default:
        score = this._jaroWinklerSimilarity(s1, s2);
    }

    return Math.round(score * 100);
  }

  /**
   * Verificar se o match atende ao threshold mínimo
   */
  isConfident(str1, str2) {
    const similarity = this.calculateSimilarity(str1, str2);
    return similarity >= this.threshold;
  }

  /**
   * Obter score de similaridade com detalhes
   */
  getDetailedScore(str1, str2) {
    const similarity = this.calculateSimilarity(str1, str2);
    const isConfident = similarity >= this.threshold;

    return {
      similarity,
      threshold: this.threshold,
      isConfident,
      algorithm: this.algorithm,
      message: isConfident 
        ? `✓ Match confiante (${similarity}% >= ${this.threshold}%)`
        : `✗ Match abaixo do threshold (${similarity}% < ${this.threshold}%)`
    };
  }

  /**
   * Normalizar string para comparação
   */
  _normalize(str) {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove caracteres especiais
      .replace(/\s+/g, ' '); // Normaliza espaços
  }

  /**
   * Algoritmo Levenshtein Distance
   * Mede quantas edições são necessárias para transformar uma string em outra
   */
  _levenshteinSimilarity(s1, s2) {
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1;

    const distance = this._levenshteinDistance(s1, s2);
    return 1 - (distance / maxLen);
  }

  _levenshteinDistance(s1, s2) {
    const matrix = Array(s2.length + 1)
      .fill(null)
      .map(() => Array(s1.length + 1).fill(0));

    for (let i = 0; i <= s1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= s2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= s2.length; j++) {
      for (let i = 1; i <= s1.length; i++) {
        const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[s2.length][s1.length];
  }

  /**
   * Algoritmo Jaro-Winkler
   * Melhor para nomes e strings curtas
   */
  _jaroWinklerSimilarity(s1, s2) {
    const jaro = this._jaroSimilarity(s1, s2);

    // Prefix bonus (até 4 caracteres)
    let prefix = 0;
    for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }

    return jaro + prefix * 0.1 * (1 - jaro);
  }

  _jaroSimilarity(s1, s2) {
    if (s1.length === 0 && s2.length === 0) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    const matchDistance = Math.max(s1.length, s2.length) / 2 - 1;
    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    // Encontrar matches
    for (let i = 0; i < s1.length; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, s2.length);

      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0;

    // Contar transposições
    let k = 0;
    for (let i = 0; i < s1.length; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }

    return (
      (matches / s1.length +
        matches / s2.length +
        (matches - transpositions / 2) / matches) /
      3
    );
  }

  /**
   * Algoritmo Cosine Similarity
   * Compara vetores de caracteres
   */
  _cosineSimilarity(s1, s2) {
    const profile1 = this._getCharacterProfile(s1);
    const profile2 = this._getCharacterProfile(s2);

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    // Calcular produto escalar e normas
    const allKeys = new Set([...Object.keys(profile1), ...Object.keys(profile2)]);

    for (const key of allKeys) {
      const val1 = profile1[key] || 0;
      const val2 = profile2[key] || 0;
      dotProduct += val1 * val2;
      norm1 += val1 * val1;
      norm2 += val2 * val2;
    }

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  _getCharacterProfile(str) {
    const profile = {};
    for (const char of str) {
      profile[char] = (profile[char] || 0) + 1;
    }
    return profile;
  }
}

module.exports = FuzzyMatcher;
