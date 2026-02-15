const socket = io();
let autoScroll = true;

// Elements
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const lastRun = document.getElementById('lastRun');
const schedulerStatus = document.getElementById('schedulerStatus');
const logsContainer = document.getElementById('logsContainer');
const autoScrollCheckbox = document.getElementById('autoScroll');

// Buttons
const btnRunNow = document.getElementById('btnRunNow');
const btnRunDryRun = document.getElementById('btnRunDryRun');
const btnPause = document.getElementById('btnPause');
const btnResume = document.getElementById('btnResume');
const btnClearLogs = document.getElementById('btnClearLogs');

// Auto-scroll toggle
autoScrollCheckbox.addEventListener('change', (e) => {
    autoScroll = e.target.checked;
});

// Clear logs
btnClearLogs.addEventListener('click', () => {
    logsContainer.innerHTML = '';
});

// WebSocket events
socket.on('connect', () => {
    addLog('info', 'Conectado ao servidor');
});

socket.on('disconnect', () => {
    addLog('error', 'Desconectado do servidor');
    updateStatusBadge('disconnected');
});

socket.on('state', (state) => {
    updateState(state);
});

socket.on('log', (log) => {
    addLog(log.level, log.message, log.timestamp);
});

// API calls
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

// Update state
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

// Update status badge
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

// Add log
function addLog(level, message, timestamp) {
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
        <span class="log-message">${message}</span>
    `;
    
    logsContainer.appendChild(logEntry);
    
    // Auto-scroll
    if (autoScroll) {
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }
    
    // Limit logs to 500 entries
    while (logsContainer.children.length > 500) {
        logsContainer.removeChild(logsContainer.firstChild);
    }
}

// Load initial data
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

// Update stats
function updateStats(stats) {
    if (!stats || stats.message) {
        return; // No stats available
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
