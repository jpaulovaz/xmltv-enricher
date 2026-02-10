require('dotenv').config();
const fs = require('fs');
const path = require('path');
const config = require('./src/config');
const logger = require('./src/utils/logger');
const { extractCleanTitle } = require('./src/utils/helpers');
const FuzzyMatcher = require('./src/utils/fuzzyMatcher');
const TMDbAPI = require('./src/apis/tmdb');
const TVDbAPI = require('./src/apis/tvdb');
const OMDbAPI = require('./src/apis/omdb');

async function rodarDiagnostico() {
    const inputPath = path.join(__dirname, 'diagnostico.txt');
    const outputPath = path.join(__dirname, 'resultado_diagnostico.csv');

    if (!fs.existsSync(inputPath)) {
        console.error('❌ Erro: diagnostico.txt não encontrado.');
        return;
    }

    const titulos = fs.readFileSync(inputPath, 'utf-8')
        .split('\n')
        .map(t => t.trim())
        .filter(t => t.length > 0);

    // Inicializar APIs
    const apis = [
        { name: 'TMDb', instance: new TMDbAPI(process.env.TMDB_API_KEY) },
        { name: 'TVDb', instance: new TVDbAPI(process.env.TVDB_API_KEY) },
        { name: 'OMDb', instance: new OMDbAPI(process.env.OMDB_API_KEY) }
    ].filter(a => a.instance.apiKey || a.instance.token);

    const fuzzy = new FuzzyMatcher(config.matching.algorithm, config.matching.confidenceThreshold);

    console.log(`\n🔍 Processando ${titulos.length} títulos...`);

    // Cabeçalho do CSV (Excel amigável usando ponto e vírgula como separador)
    let csvContent = "Título Original;Título de Busca;Status;Confiança;Resultado API;Fonte\n";

    for (const original of titulos) {
        const clean = extractCleanTitle(original);
        const searchTitle = clean || original;
        let found = false;
        let resultLine = `"${original.replace(/"/g, '""')}";"${searchTitle.replace(/"/g, '""')}";`;

        for (const api of apis) {
            try {
                // TVDb precisa de login
                if (api.name === 'TVDb') await api.instance.authenticate();
                
                const results = await api.instance.search(searchTitle);
                
                if (results && results.length > 0) {
                    const best = results[0];
                    const matchTitle = best.title || best.name || best.Title;
                    const score = fuzzy.calculateSimilarity(searchTitle, matchTitle);
                    const status = score >= config.matching.confidenceThreshold ? '✅ OK' : '⚠️ BAIXA CONFIANÇA';
                    
                    resultLine += `${status};${score}%;"${matchTitle.replace(/"/g, '""')}";${api.name}\n`;
                    found = true;
                    break; // Para na primeira API que achar algo
                }
            } catch (e) {
                // Pula erro de API e tenta a próxima
            }
        }

        if (!found) {
            resultLine += `❌ NADA ENCONTRADO;0%;-;-\n`;
        }

        csvContent += resultLine;
        console.log(`Procurando: ${searchTitle}...`);
    }

    fs.writeFileSync(outputPath, '\ufeff' + csvContent, 'utf-8'); // \ufeff ajuda o Excel com acentos (UTF-8 BOM)
    console.log(`\n✅ Prontinho! Resultado salvo em: resultado_diagnostico.csv`);
    console.log(`Dica: No Excel, se as colunas ficarem juntas, use "Dados > Texto para Colunas" e escolha o separador ";"`);
}

rodarDiagnostico();
