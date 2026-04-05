const axios = require('axios');
const logger = require('../utils/logger');

class IMDbAPI {
    constructor() {
        this.name = 'imdb';
        this.source = 'imdb';
        this.baseUrl = 'https://v2.sg.media-imdb.com/suggestion';
    }

    // Não precisa de initialize() ou authenticate() pois é pública

    async enrichProgram(title, year = null) {
        try {
            // 1. Sanitização Específica para URL do IMDb
            // Remove acentos, troca espaços por _ e remove caracteres especiais
            const cleanQuery = title
                .toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
                .replace(/[^a-z0-9\s]/g, '') // Remove tudo que não é letra/número/espaço
                .trim()
                .replace(/\s+/g, '_'); // Troca espaço por underscore

            if (cleanQuery.length < 2) return null;

            const firstChar = cleanQuery.charAt(0);
            const url = `${this.baseUrl}/${firstChar}/${cleanQuery}.json`;

            // 2. Requisição (Timeout curto pois é CDN rápida)
            const response = await axios.get(url, { timeout: 5000 });

            if (!response.data || !response.data.d || response.data.d.length === 0) {
                return null;
            }

            // 3. Filtragem Inteligente
            // O endpoint retorna filmes, séries, atores e jogos. Precisamos filtrar.
            const candidates = response.data.d.filter(item => {
                // q = tipo (feature, TV series, TV mini-series, etc)
                // Ignoramos 'video game', 'short', etc se possível, mas o foco é imagem.
                const isMedia = item.q === 'feature' || item.q === 'TV series' || item.q === 'TV mini-series' || item.q === 'TV movie';

                // Se tiver ano, valida com margem de erro de 1 ano
                if (year && item.y) {
                    return isMedia && Math.abs(item.y - year) <= 1;
                }
                return isMedia;
            });

            if (candidates.length === 0) return null;

            // Pega o primeiro candidato (IMDb ordena por relevância/popularidade)
            const best = candidates[0];

            // 4. Truque da Imagem em Alta Resolução
            // A URL vem assim: ...V1_UY67_CR0,0,45,67_AL_.jpg
            // Cortamos antes do "._V1_" para pegar a original.
            let highResImage = null;
            if (best.i && best.i.imageUrl) {
                highResImage = best.i.imageUrl.split('._V1_')[0] + '.jpg';
            }

            return {
                source: 'imdb',
                id: best.id,       // tt1234567
                title: best.l,     // Label (Título)
                description: null, // IMDb Suggest não retorna sinopse
                image: highResImage,
                genres: [],        // Não retorna gêneros detalhados
                year: best.y,
                rating: null,
                type: best.q === 'feature' ? 'movie' : 'series'
            };

        } catch (error) {
            // Ignora erros 404 (comum se a busca for muito exótica)
            if (error.response && error.response.status === 404) {
                return null;
            }
            logger.debug(`IMDb Error (${title}): ${error.message}`);
            return null;
        }
    }
}

module.exports = IMDbAPI;