const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class PlaceholdersService {
  constructor() {
    this.filePath = path.join(__dirname, '../config/placeholders.json');
    this.data = this.loadFromFile();
  }

  loadFromFile() {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      logger.warn(`Erro ao carregar placeholders.json: ${error.message}`);
    }
    
    return { styles: {}, channels: {} };
  }

  saveToFile() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
      logger.info('Placeholders salvos com sucesso');
      return true;
    } catch (error) {
      logger.error(`Erro ao salvar placeholders.json: ${error.message}`);
      return false;
    }
  }

  // ===== DECODIFICAR ENTIDADES HTML =====
  decodeHtmlEntities(text) {
    const entities = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'"
    };
    
    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
      decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }
    return decoded;
  }

  // ===== CATEGORIAS =====
  getCategories() {
    const categories = [];
    for (const [name, url] of Object.entries(this.data.styles || {})) {
      categories.push({ name, url });
    }
    return categories;
  }

  addCategory(categoryName, placeholderUrl) {
    if (!categoryName || !placeholderUrl) {
      return { success: false, message: 'Nome e URL são obrigatórios' };
    }

    if (this.data.styles[categoryName]) {
      return { success: false, message: 'Categoria já existe' };
    }

    this.data.styles[categoryName] = placeholderUrl;
    this.saveToFile();
    
    return { success: true, message: 'Categoria adicionada com sucesso' };
  }

  deleteCategory(categoryName) {
    if (!this.data.styles[categoryName]) {
      return { success: false, message: 'Categoria não encontrada' };
    }

    // Verificar se há canais usando esta categoria
    const channelsUsing = Object.entries(this.data.channels || {})
      .filter(([_, cat]) => cat === categoryName)
      .map(([ch, _]) => ch);

    if (channelsUsing.length > 0) {
      return { 
        success: false, 
        message: `Não é possível deletar. ${channelsUsing.length} canal(is) está(ão) usando esta categoria` 
      };
    }

    delete this.data.styles[categoryName];
    this.saveToFile();
    
    return { success: true, message: 'Categoria deletada com sucesso' };
  }

  // ===== CANAIS =====
  getChannels() {
    const channels = [];
    for (const [channel, category] of Object.entries(this.data.channels || {})) {
      channels.push({ channel, category });
    }
    return channels;
  }

  linkChannelToCategory(channelName, categoryName) {
    if (!channelName || !categoryName) {
      return { success: false, message: 'Canal e categoria são obrigatórios' };
    }

    if (!this.data.styles[categoryName]) {
      return { success: false, message: 'Categoria não existe' };
    }

    this.data.channels[channelName] = categoryName;
    this.saveToFile();
    
    return { success: true, message: 'Canal vinculado com sucesso' };
  }

  unlinkChannel(channelName) {
    if (!this.data.channels[channelName]) {
      return { success: false, message: 'Canal não encontrado' };
    }

    delete this.data.channels[channelName];
    this.saveToFile();
    
    return { success: true, message: 'Canal desvinculado com sucesso' };
  }

  // ===== ANÁLISE =====
  analyzeChannels(xmltvChannels = []) {
    const allChannels = new Set();
    const configuredChannels = new Set();
    const missingChannels = new Set();

    // Se não passou canais, tentar ler do xmltv.xml
    if (xmltvChannels.length === 0) {
      try {
        // Tentar primeiro em ./output/xmltv.xml
        let xmltvPath = path.join(__dirname, '../../output/xmltv.xml');
        if (!fs.existsSync(xmltvPath)) {
          // Se não existir, tentar na raiz
          xmltvPath = path.join(__dirname, '../../xmltv.xml');
        }
        if (fs.existsSync(xmltvPath)) {
          const content = fs.readFileSync(xmltvPath, 'utf-8');
          
          // CORRIGIDO: Extrair display-name ao invés de channel id
          // Regex que captura o primeiro <display-name> de cada <channel>
          const channelRegex = /<channel[^>]*>\s*<display-name>([^<]+)<\/display-name>/g;
          let match;
          while ((match = channelRegex.exec(content)) !== null) {
            let displayName = match[1].trim();
            // CORRIGIDO: Decodificar entidades HTML (A&amp;E HD → A&E HD)
            displayName = this.decodeHtmlEntities(displayName);
            // Ignorar números de canal (como "665", "601", "573.1", etc.)
            // Pegar apenas o nome legível do canal
            if (!displayName.match(/^\d+(\.\d+)?$/)) {
              xmltvChannels.push(displayName);
            }
          }
        }
      } catch (error) {
        logger.warn(`Erro ao ler xmltv.xml: ${error.message}`);
      }
    }

    // Adicionar canais do XMLTV
    xmltvChannels.forEach(ch => allChannels.add(ch));

    // Adicionar canais já configurados
    Object.keys(this.data.channels || {}).forEach(ch => {
      allChannels.add(ch);
      configuredChannels.add(ch);
    });

    // Identificar canais faltando
    allChannels.forEach(ch => {
      if (!configuredChannels.has(ch)) {
        missingChannels.add(ch);
      }
    });

    return {
      total: allChannels.size,
      configured: configuredChannels.size,
      missing: missingChannels.size,
      configuredList: Array.from(configuredChannels).map(ch => ({
        channel: ch,
        category: this.data.channels[ch]
      })),
      missingList: Array.from(missingChannels).sort()
    };
  }

  // ===== PLACEHOLDER PADRÃO =====
  getPlaceholderForChannel(channelName) {
    const category = this.data.channels[channelName];
    if (category && this.data.styles[category]) {
      return this.data.styles[category];
    }
    
    // Retornar placeholder padrão se existir
    return this.data.styles.default || null;
  }
}

module.exports = PlaceholdersService;
