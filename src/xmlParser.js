const axios = require('axios');
const xml2js = require('xml2js');
const logger = require('./utils/logger');

/**
 * Baixa o XMLTV do Tvheadend
 */
const fetchXml = async (tvheadendConfig) => {
  try {
    const { url, user, pass } = tvheadendConfig;
    const xmlUrl = `${url}/xmltv/channels`;

    logger.info(`Baixando XMLTV de: ${xmlUrl}`);

    const auth = (user && pass) ? { username: user, password: pass } : undefined;

    const response = await axios.get(xmlUrl, {
      auth,
      responseType: 'text', // Garante que recebemos texto/xml
      timeout: 30000 // 30 segundos de timeout para XMLs grandes
    });

    if (response.status !== 200) {
      throw new Error(`Tvheadend retornou status ${response.status}`);
    }

    return response.data;
  } catch (error) {
    throw new Error(`Falha ao baixar XML do Tvheadend: ${error.message}`);
  }
};

/**
 * Faz o parse do XML string para JSON
 */
const parseXml = (xmlData) => {
  return new Promise((resolve, reject) => {
    const parser = new xml2js.Parser();
    parser.parseString(xmlData, (err, result) => {
      if (err) {
        reject(new Error(`Erro ao processar XML: ${err.message}`));
      } else {
        resolve(result);
      }
    });
  });
};

module.exports = {
  fetchXml,
  parseXml
};