/**
 * Lógica do Frontend para a Revisão Manual (Manual Overrides)
 */
document.addEventListener('DOMContentLoaded', () => {
    // Elementos da Interface
    const failuresTableBody = document.getElementById('failuresTableBody');
    const overridesTableBody = document.getElementById('overridesTableBody');
    const overrideModal = document.getElementById('overrideModal');
    const modalTitleInput = document.getElementById('modalTitle');
    const modalTmdbIdInput = document.getElementById('modalTmdbId');
    const modalTypeSelect = document.getElementById('modalType');

    // Botões
    const btnSaveOverride = document.getElementById('btnSaveOverride');
    const btnCloseModal = document.getElementById('btnCloseModal');

    // Função para carregar as falhas da auditoria
    async function loadFailures() {
        try {
            failuresTableBody.innerHTML = '<tr><td colspan="2" style="text-align:center;">A procurar falhas na auditoria...</td></tr>';
            const response = await fetch('/api/audit/failures');
            const failures = await response.json();

            if (!failures || failures.length === 0) {
                failuresTableBody.innerHTML = '<tr><td colspan="2" style="text-align:center; color: green;">Nenhuma falha encontrada! O seu XML está limpo. 🎉</td></tr>';
                return;
            }

            failuresTableBody.innerHTML = '';
            failures.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <strong>${item.originalTitle}</strong><br>
                        <small style="color: #666;">${item.channel} | Confiança: ${item.confidence}</small>
                    </td>
                    <td style="text-align:right;">
                        <button class="btn btn-primary btn-small btn-fix" data-title="${encodeURIComponent(item.originalTitle)}">🔗 Vincular</button>
                    </td>
                `;
                failuresTableBody.appendChild(tr);
            });

            // Adicionar evento aos botões de vincular
            document.querySelectorAll('.btn-fix').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const title = decodeURIComponent(e.target.getAttribute('data-title'));
                    openModal(title);
                });
            });
        } catch (error) {
            console.error('Erro ao carregar falhas:', error);
            failuresTableBody.innerHTML = '<tr><td colspan="2" style="text-align:center; color: red;">Erro ao carregar auditoria.</td></tr>';
        }
    }

    // Função para carregar os Overrides já existentes
    async function loadOverrides() {
        try {
            overridesTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">A carregar regras...</td></tr>';
            const response = await fetch('/api/overrides');
            const overrides = await response.json();

            if (!overrides || overrides.length === 0) {
                overridesTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: #888;">Nenhum override manual cadastrado.</td></tr>';
                return;
            }

            overridesTableBody.innerHTML = '';
            overrides.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.title}</td>
                    <td><code>${item.tmdbId}</code></td>
                    <td><span class="api-badge" style="background: #6c757d;">${item.type}</span></td>
                    <td style="text-align:right;">
                        <button class="btn btn-small btn-delete-override" style="background:#dc3545; color:white;" data-title="${encodeURIComponent(item.title)}">🗑️</button>
                    </td>
                `;
                overridesTableBody.appendChild(tr);
            });

            // Evento para eliminar override
            document.querySelectorAll('.btn-delete-override').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const title = decodeURIComponent(e.currentTarget.getAttribute('data-title'));
                    if (confirm(`Remover regra para: "${title}"?`)) {
                        await deleteOverride(title);
                    }
                });
            });
        } catch (error) {
            console.error('Erro ao carregar overrides:', error);
        }
    }

    // Modal Control
    function openModal(title) {
        modalTitleInput.value = title;
        modalTmdbIdInput.value = '';
        overrideModal.style.display = 'flex';
    }

    function closeModal() {
        overrideModal.style.display = 'none';
    }

    // Ações
    async function saveOverride() {
        const title = modalTitleInput.value;
        const tmdbId = modalTmdbIdInput.value;
        const type = modalTypeSelect.value;

        if (!tmdbId) {
            alert('Por favor, insira o ID do TMDb.');
            return;
        }

        try {
            const response = await fetch('/api/overrides', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, tmdbId, type })
            });

            if (response.ok) {
                closeModal();
                loadFailures();
                loadOverrides();
            } else {
                alert('Erro ao guardar override.');
            }
        } catch (error) {
            console.error('Erro ao guardar:', error);
        }
    }

    async function deleteOverride(title) {
        try {
            const response = await fetch(`/api/overrides/${encodeURIComponent(title)}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                loadOverrides();
            }
        } catch (error) {
            console.error('Erro ao eliminar:', error);
        }
    }

    // Eventos de Fechar e Salvar
    btnCloseModal.addEventListener('click', closeModal);
    btnSaveOverride.addEventListener('click', saveOverride);

    // Integrar com o sistema de abas existente no app.js
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (button.getAttribute('data-tab') === 'manual-override') {
                // Carrega apenas as regras salvas (que é rápido por estar em memória)
                loadOverrides();
                // Limpa a tabela de falhas até que o usuário clique em atualizar
                failuresTableBody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:#888;">Clique no botão "Atualizar Falhas" acima.</td></tr>';
            }
        });
    });
    document.getElementById('btnRefreshFailures').addEventListener('click', loadFailures);
});