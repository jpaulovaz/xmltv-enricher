async function loadOverrides() {
    const tbody = document.getElementById('overridesTableBody');
    tbody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';

    const res = await fetch('/overrides');
    const data = await res.json();

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="4">Nenhum override cadastrado</td></tr>';
        return;
    }

    tbody.innerHTML = '';

    data.forEach(item => {
        const row = document.createElement('tr');

        row.innerHTML = `
            <td>${item.original_title}</td>
            <td>${item.forced_tmdb_id}</td>
            <td>${item.forced_type}</td>
            <td>
                <button class="btn btn-small btn-warning"
                    onclick="deleteOverride(${item.id})">
                    🗑 Remover
                </button>
            </td>
        `;

        tbody.appendChild(row);
    });
}

async function saveOverride() {
    const title = document.getElementById('overrideTitle').value;
    const tmdbId = document.getElementById('overrideTmdbId').value;
    const type = document.getElementById('overrideType').value;

    if (!title || !tmdbId) {
        alert('Preencha todos os campos');
        return;
    }

    await fetch('/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, tmdbId, type })
    });

    document.getElementById('overrideTitle').value = '';
    document.getElementById('overrideTmdbId').value = '';

    loadOverrides();
}

async function deleteOverride(id) {
    await fetch(`/overrides/${id}`, { method: 'DELETE' });
    loadOverrides();
}
