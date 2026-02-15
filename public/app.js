const socket = io();
let autoScroll = true;
let showDebugLogs = true;
let logLevelFilter = 'all';

// Elements
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const lastRun = document.getElementById('lastRun');
const schedulerStatus = document.getElementById('schedulerStatus');
const logsContainer = document.getElementById('logsContainer');
const autoScrollCheckbox = document.getElementById('autoScroll');
const showDebugCheckbox = document.getElementById('showDebug');
const logLevelFilterSelect = document.getElementById('logLevelFilter');

// Buttons
const btnRunNow = document.getElementById('btnRunNow');
const btnRunDryRun = document.getElementById('btnRunDryRun');
const btnPause = document.getElementById('btnPause');
const btnResume = document.getElementById('btnResume');
const btnClearLogs = document.getElementById('btnClearLogs');

// Tabs
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

// Config form
const configForm = document.getElementById('configForm');
const btnResetConfig = document.getElementById('btnResetConfig');

// ============================================
// TABS FUNCTIONALITY
// ============================================
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.getAttribute('data-tab');
        
        // Remove active class from all tabs
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked tab
        button.classList.add('active');
        document.getElementById(tabName).classList.add('active');
        
        // Load config when opening settings tab
        if (tabName === 'settings') {
            loadConfig();
        }
    });
});

// ============================================
// LOG CONTROLS
// ============================================
autoScrollCheckbox.addEventListener('change', (e) => {
    autoScroll = e.target.checked;
});

showDebugCheckbox.addEventListener('change', (e) => {
    showDebugLogs = e.target.checked;
});

logLevelFilterSelect.addEventListener('change', (e) => {
    logLevelFilter = e.target.value;
});

btnClearLogs.addEventListener('click', () => {
    logsContainer.innerHTML = '';
});

// ============================================
// WEBSOCKET EVENTS
// ============================================
socket.on('connect', () => {
    addLog('info', '🟢 Conectado ao servidor');
});

socket.on('disconnect', () => {
    addLog('error', '🔴 Desconectado do servidor');
    updateStatusBadge('disconnected');
});

socket.on('state', (state) => {
    updateState(state);
});

socket.on('log', (log) => {
    addLog(log.level, log.message, log.timestamp);
});

// ============================================
// API CALLS - CONTROLS
// ============================================
btnRunNow.addEventListener('click', async () => {
    if (confirm('Deseja executar o enricher agora?')) {
        try {
            btnRunNow.disabled = true;
            const response = await fetch('/api/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dryRun: false })
            });
            const data = await response.json();
            addLog('info', data.message || 'Execução iniciada');
        } catch (error) {
            addLog('error', `Erro ao executar: ${error.message}`);
        } finally {
            setTimeout(() => { btnRunNow.disabled = false; }, 2000);
        }
    }
});

btnRunDryRun.addEventListener('click', async () => {
    if (confirm('Deseja executar um dry run (sem salvar o arquivo final)?')) {
        try {
            btnRunDryRun.disabled = true;
            const response = await fetch('/api/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dryRun: true })
            });
            const data = await response.json();
            addLog('info', data.message || 'Dry run iniciado');
        } catch (error) {
            addLog('error', `Erro ao executar: ${error.message}`);
        } finally {
            setTimeout(() => { btnRunDryRun.disabled = false; }, 2000);
        }
    }
});

btnPause.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/pause', { method: 'POST' });
        const data = await response.json();
        addLog('info', data.message || 'Scheduler pausado');
    } catch (error) {
        addLog('error', `Erro ao pausar: ${error.message}`);
    }
});

btnResume.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/resume', { method: 'POST' });
        const data = await response.json();
        addLog('info', data.message || 'Scheduler retomado');
    } catch (error) {
        addLog('error', `Erro ao retomar: ${error.message}`);
    }
});

// ============================================
// CONFIG FORM
// ============================================
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        
        // Preencher formulário
        Object.keys(config).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = config[key] === 'true' || config[key] === true;
                } else {
                    element.value = config[key];
                }
            }
        });
    } catch (error) {
        addLog('error', `Erro ao carregar configurações: ${error.message}`);
    }
}

configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(configForm);
    const config = {};
    
    // Coletar todos os valores do formulário
    for (const [key, value] of formData.entries()) {
        const element = document.getElementById(key);
        if (element && element.type === 'checkbox') {
            config[key] = element.checked ? 'true' : 'false';
        } else {
            config[key] = value;
        }
    }
    
    // Adicionar checkboxes desmarcados (não aparecem no FormData)
    const checkboxes = configForm.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (!config[cb.id]) {
            config[cb.id] = 'false';
        }
    });
    
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('✅ ' + result.message);
            addLog('info', 'Configurações salvas com sucesso');
        } else {
            alert('❌ Erro: ' + result.error);
            addLog('error', 'Erro ao salvar configurações: ' + result.error);
        }
    } catch (error) {
        alert('❌ Erro ao salvar: ' + error.message);
        addLog('error', `Erro ao salvar configurações: ${error.message}`);
    }
});

btnResetConfig.addEventListener('click', () => {
    if (confirm('Deseja resetar o formulário com os valores atuais do servidor?')) {
        loadConfig();
    }
});

// ============================================
// STATE UPDATE
// ============================================
function updateState(state) {
    // Status badge
    if (state.running) {
        updateStatusBadge('running');
    } else if (state.paused) {
        updateStatusBadge('paused');
    } else {
        updateStatusBadge('idle');
    }

    // Last run
    if (state.lastRun) {
        lastRun.textContent = new Date(state.lastRun).toLocaleString('pt-BR');
    }

    // Scheduler status
    schedulerStatus.textContent = state.paused ? '⏸️ Pausado' : '▶️ Ativo';
    schedulerStatus.className = state.paused ? 'status-paused' : 'status-active';

    // Enable/disable buttons
    btnRunNow.disabled = state.running;
    btnRunDryRun.disabled = state.running;
    btnPause.disabled = state.paused || state.running;
    btnResume.disabled = !state.paused;
}

function updateStatusBadge(status) {
    statusBadge.className = 'status-badge status-' + status;
    
    const statusTexts = {
        running: '🔄 Executando',
        paused: '⏸️ Pausado',
        idle: '✅ Ocioso',
        disconnected: '❌ Desconectado'
    };
    
    statusText.textContent = statusTexts[status] || 'Desconhecido';
}

// ============================================
// LOGS
// ============================================
function addLog(level, message, timestamp) {
    // Filtrar por nível se necessário
    if (logLevelFilter !== 'all' && level !== logLevelFilter) {
        return;
    }
    
    // Filtrar logs de debug se desabilitado
    if (!showDebugLogs && level === 'debug') {
        return;
    }
    
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry log-' + level;
    
    const time = timestamp ? new Date(timestamp).toLocaleTimeString('pt-BR') : new Date().toLocaleTimeString('pt-BR');
    
    const levelIcons = {
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
        debug: '🐛'
    };
    
    logEntry.innerHTML = `
        <span class="log-time">[${time}]</span>
        <span class="log-level">${levelIcons[level] || '📝'}</span>
        <span class="log-message">${escapeHtml(message)}</span>
    `;
    
    logsContainer.appendChild(logEntry);
    
    // Auto-scroll
    if (autoScroll) {
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }
    
    // Limit logs to 1000 entries
    while (logsContainer.children.length > 1000) {
        logsContainer.removeChild(logsContainer.firstChild);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// STATS
// ============================================
function updateStats(stats) {
    if (!stats || stats.message) {
        return;
    }
    
    document.getElementById('totalPrograms').textContent = stats.totalPrograms || '-';
    document.getElementById('enrichedPrograms').textContent = stats.enrichedPrograms || '-';
    document.getElementById('successRate').textContent = stats.successRate ? `${stats.successRate}%` : '-';
    document.getElementById('duration').textContent = stats.duration || '-';
    document.getElementById('cacheHits').textContent = stats.cacheHits || '-';
    document.getElementById('cacheHitRate').textContent = stats.cacheHitRate ? `${stats.cacheHitRate}%` : '-';
    
    // API calls
    if (stats.apiCalls) {
        document.getElementById('tmdbCalls').textContent = stats.apiCalls.tmdb || 0;
        document.getElementById('tvdbCalls').textContent = stats.apiCalls.tvdb || 0;
        document.getElementById('omdbCalls').textContent = stats.apiCalls.omdb || 0;
        document.getElementById('plexCalls').textContent = stats.apiCalls.plex || 0;
        document.getElementById('plexdbCalls').textContent = stats.apiCalls.plexdb || 0;
    }
}

// ============================================
// INITIALIZATION
// ============================================
async function loadInitialData() {
    try {
        // Load status
        const statusResponse = await fetch('/api/status');
        const statusData = await statusResponse.json();
        updateState(statusData);
        
        // Load stats
        const statsResponse = await fetch('/api/stats');
        const statsData = await statsResponse.json();
        updateStats(statsData);
    } catch (error) {
        addLog('error', `Erro ao carregar dados iniciais: ${error.message}`);
    }
}

// Refresh stats periodically
setInterval(async () => {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        updateStats(data);
    } catch (error) {
        // Silent fail
    }
}, 5000);

// Initialize
loadInitialData();
