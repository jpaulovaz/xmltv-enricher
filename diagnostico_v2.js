require('dotenv').config();
const fs = require('fs');
const path = require('path');
const config = require('./src/config'); // Carrega configs para pegar thresholds
const { extractCleanTitle, cleanSeriesInfo, extractYearFromTitle } = require('./src/utils/helpers');
const FuzzyMatcher = require('./src/utils/fuzzyMatcher');

// Importar as APIs
const TMDbAPI = require('./src/apis/tmdb');
const TVDbAPI = require('./src/apis/tvdb');
const OMDbAPI = require('./src/apis/omdb');
// Se quiser testar PlexDB aqui, teria que importar, mas geralmente diagnóstico é para APIs externas

async function rodarDiagnosticoCompleto() {
    console.log('--- INICIANDO DIAGNÓSTICO COMPLETO (COM APIs) ---');
    console.log('Regra aplicada: Hífen Protegido e Dicionário de Exclusão.\n');

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

    // Inicializar APIs (Mesma ordem de prioridade sugerida)
    const apis = [];
    if (process.env.TMDB_API_KEY) apis.push(new TMDbAPI(process.env.TMDB_API_KEY));
    if (process.env.TVDB_API_KEY) apis.push(new TVDbAPI(process.env.TVDB_API_KEY, process.env.TVDB_PIN)); // Adicionei PIN caso use v4
    if (process.env.OMDB_API_KEY) apis.push(new OMDbAPI(process.env.OMDB_API_KEY));

    // Inicializar Fuzzy Matcher
    const fuzzy = new FuzzyMatcher('jaro_winkler', 0.85); // Usando padrão 85%

    let csvContent = '\ufeffTítulo Original;Busca Usada;Status;Confiança;Resultado Encontrado;Fonte API\n';

    for (const tituloOriginal of titulos) {
        console.log(`\n🔍 Analisando: "${tituloOriginal}"`);
        
        const year = extractYearFromTitle(tituloOriginal);
        const cleanTitle = extractCleanTitle(tituloOriginal);

        // --- AQUI ESTÁ A CORREÇÃO DO HÍFEN (Igual ao MatchingService novo) ---
        // Protege hífens de nomes compostos e corta apenas separadores reais
        const splitRegex = /(\s+[-–]\s+|\s*\()/;
        
        const titulosParaTentar = [
            cleanTitle,
            cleanSeriesInfo(cleanTitle),
            cleanTitle.split(splitRegex)[0].trim()
        ].filter((v, i, a) => v && v.length > 1 && a.indexOf(v) === i);
        // ---------------------------------------------------------------------

        let encontrou = false;
        let melhorResultado = null;

        // Tenta cada variação de título
        loopTitulos: for (const busca of titulosParaTentar) {
            console.log(`   -> Tentando buscar por: "${busca}"...`);

            // Tenta cada API
            for (const api of apis) {
                try {
                    // Inicializa se necessário (TVDb token)
                    if (api.authenticate) await api.authenticate();

                    // Faz a busca REAL na API
                    const resultado = await api.enrichProgram(busca, year);

                    if (resultado) {
                        // Calcula confiança
                        let score = fuzzy.calculateSimilarity(busca, resultado.title);
                        
                        // Bônus para resultados exatos (lógica do seu sistema)
                        if (score < 85 && score > 40 && !year) score += 20;

                        if (score >= 85) {
                            console.log(`      ✅ Sucesso via ${api.name}: "${resultado.title}" (${score}%)`);
                            
                            csvContent += `"${tituloOriginal}";"${busca}";✅ ENCONTRADO;${score}%;"${resultado.title}";${api.name}\n`;
                            encontrou = true;
                            break loopTitulos; // Para tudo, achou o campeão
                        } else {
                           console.log(`      ⚠️  Baixa confiança via ${api.name}: "${resultado.title}" (${score}%)`);
                        }
                    }
                } catch (erro) {
                    console.log(`      ❌ Erro na API ${api.name}: ${erro.message}`);
                }
            }
        }

        if (!encontrou) {
            console.log(`   ❌ Nenhuma API encontrou com confiança suficiente.`);
            csvContent += `"${tituloOriginal}";-;❌ NÃO ENCONTRADO;0%;-;-\n`;
        }
    }

    fs.writeFileSync(outputPath, csvContent, 'utf-8');
    console.log(`\n📄 Relatório salvo em: ${outputPath}`);
}

rodarDiagnosticoCompleto();