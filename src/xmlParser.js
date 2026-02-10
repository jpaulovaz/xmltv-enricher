const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

class XMLParser {
  constructor() {
    this.parser = new xml2js.Parser();
    this.builder = new xml2js.Builder({
      xmldec: { version: '1.0', encoding: 'utf-8' },
      doctype: 'tv SYSTEM "xmltv.dtd"'
    });
  }

  /**
   * Fazer download do XML do Tvheadend
   */
  async downloadFromTvheadend(tvheadendUrl, username = '', password = '') {
    try {
      const axios = require('axios');
      
      const url = `${tvheadendUrl}/xmltv`;
      const config = {
        timeout: 30000
      };

      if (username && password) {
        config.auth = {
          username,
          password
        };
      }

      logger.info(`Baixando XML do Tvheadend: ${url}`);
      const response = await axios.get(url, config);

      logger.info(`XML baixado com sucesso (${response.data.length} bytes)`);
      return response.data;

    } catch (error) {
      logger.error(`Erro ao baixar XML do Tvheadend: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fazer parse do XML
   */
  async parse(xmlContent) {
    try {
      const result = await this.parser.parseStringPromise(xmlContent);
      return result;
    } catch (error) {
      logger.error(`Erro ao fazer parse do XML: ${error.message}`);
      throw error;
    }
  }

  /**
   * Converter objeto de volta para XML
   */
  build(obj) {
    try {
      return this.builder.buildObject(obj);
    } catch (error) {
      logger.error(`Erro ao construir XML: ${error.message}`);
      throw error;
    }
  }

  /**
   * Salvar XML em arquivo
   */
  async saveToFile(xmlContent, filePath) {
    try {
      // Criar diretório se não existir
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, xmlContent, 'utf8');
      logger.info(`XML salvo em: ${filePath}`);

      return true;
    } catch (error) {
      logger.error(`Erro ao salvar XML: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extrair canais do XML
   */
  getChannels(xmlObj) {
    return xmlObj.tv?.channel || [];
  }

  /**
   * Extrair programas do XML
   */
  getProgrammes(xmlObj) {
    return xmlObj.tv?.programme || [];
  }

  /**
   * Obter programas de um canal específico
   */
  getProgrammesByChannel(xmlObj, channelId) {
    const programmes = this.getProgrammes(xmlObj);
    return programmes.filter(prog => prog.$?.channel === channelId);
  }
}

module.exports = XMLParser;
