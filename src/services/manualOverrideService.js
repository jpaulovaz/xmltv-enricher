const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class ManualOverrideService {
    constructor() {
        this.filePath = path.join(process.cwd(), 'data', 'manual_overrides.json');
        this.overrides = {}; // Cache em memória
        this.normalizedIndex = {}; // Índice normalizado para buscas rápidas
        this.load();
    }

    // Carrega do disco para a memória apenas uma vez (ou quando solicitado)
    load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf-8');
                this.overrides = JSON.parse(data);
                // Reconstruir índice normalizado
                this.normalizedIndex = {};
                for (const key in this.overrides) {
                    this.normalizedIndex[this._normalize(key)] = key;
                }
            }
        } catch (error) {
            logger.error(`[Override] Erro ao carregar arquivo: ${error.message}`);
            this.overrides = {};
            this.normalizedIndex = {};
        }
    }

    // Normaliza string para busca case-insensitive e sem acentos
    _normalize(str) {
        if (!str) return '';
        return str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    // Busca na memória (extremamente rápido, sem acesso ao disco)
    // Tenta: 1) Exata, 2) Normalizada, 3) Variações
    get(title) {
        if (!title) return null;
        
        // 1. Busca exata primeiro
        if (this.overrides[title]) {
            return this.overrides[title];
        }
        
        // 2. Busca normalizada (case-insensitive + sem acentos)
        const normalized = this._normalize(title);
        if (this.normalizedIndex[normalized]) {
            return this.overrides[this.normalizedIndex[normalized]];
        }
        
        // 3. Fallback: busca linear normalizada (para casos edge)
        for (const key in this.overrides) {
            if (this._normalize(key) === normalized) {
                return this.overrides[key];
            }
        }
        
        return null;
    }

    // Grava no disco e atualiza a memória
    add(title, tmdbId, type = 'movie') {
        this.overrides[title] = { tmdbId: parseInt(tmdbId), type };
        // Atualizar índice normalizado
        this.normalizedIndex[this._normalize(title)] = title;
        this.save();
    }

    save() {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.overrides, null, 2));
        } catch (error) {
            logger.error(`[Override] Erro ao salvar: ${error.message}`);
        }
    }

    getAll() {
        return Object.keys(this.overrides).map(title => ({
            title,
            ...this.overrides[title]
        }));
    }

    remove(title) {
        if (this.overrides[title]) {
            const normalized = this._normalize(title);
            delete this.overrides[title];
            delete this.normalizedIndex[normalized];
            this.save();
            return true;
        }
        return false;
    }
}

module.exports = ManualOverrideService;