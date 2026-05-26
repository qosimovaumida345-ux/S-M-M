class ProxiesPage {
    constructor(app) {
        this.app = app;
    }

    async render(container) {
        const proxies = await ipcRenderer.invoke('get-proxies');
        const alive = proxies.filter(p => p.status === 'alive').length;
        const dead = proxies.filter(p => p.status === 'dead').length;
        const unchecked = proxies.filter(p => p.status === 'unchecked').length;

        container.innerHTML = `
            <div class="fade-in">
                <div class="page-header">
                    <div>
                        <h1 class="page-title">Proxy Manager</h1>
                        <p class="page-subtitle">${proxies.length} proxies loaded</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-secondary" id="proxy-check-all">
                            <i class="fas fa-heartbeat"></i> Check All
                        </button>
                        <button class="btn btn-secondary" id="proxy-import">
                            <i class="fas fa-file-import"></i> Import
                        </button>
                        <button class="btn btn-primary" id="proxy-add">
                            <i class="fas fa-plus"></i> Add Proxy
                        </button>
                    </div>
                </div>

                <div class="stat-grid" style="margin-bottom: 20px;">
                    <div class="stat-card green">
                        <div class="stat-card-header">
                            <div class="stat-card-icon"><i class="fas fa-check-circle"></i></div>
                        </div>
                        <div class="stat-card-value">${alive}</div>
                        <div class="stat-card-label">Alive</div>
                    </div>
                    <div class="stat-card red">
                        <div class="stat-card-header">
                            <div class="stat-card-icon"><i class="fas fa-times-circle"></i></div>
                        </div>
                        <div class="stat-card-value">${dead}</div>
                        <div class="stat-card-label">Dead</div>
                    </div>
                    <div class="stat-card yellow">
                        <div class="stat-card-header">
                            <div class="stat-card-icon"><i class="fas fa-question-circle"></i></div>
                        </div>
                        <div class="stat-card-value">${unchecked}</div>
                        <div class="stat-card-label">Unchecked</div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body" style="padding: 0;">
                        ${proxies.length === 0 ? `
                            <div class="empty-state">
                                <div class="empty-state-icon"><i class="fas fa-shield-alt"></i></div>
                                <div class="empty-state-title">No Proxies</div>
                                <div class="empty-state-desc">Import proxies to enable IP rotation for your automation tasks.</div>
                            </div>
                        ` : `
                            <div class="table-wrapper">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Type</th>
                                            <th>Host</th>
                                            <th>Port</th>
                                            <th>Auth</th>
                                            <th>Status</th>
                                            <th>Response</th>
                                            <th>Country</th>
                                            <th>Last Check</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${proxies.map(p => `
                                            <tr data-id="${p.id}">
                                                <td><span class="badge badge-purple">${(p.type || 'http').toUpperCase()}</span></td>
                                                <td style="font-weight: 600; color: var(--text-primary);">${p.host}</td>
                                                <td>${p.port}</td>
                                                <td>${p.username ? '<span class="badge badge-info">Yes</span>' : '<span class="text-muted">No</span>'}</td>
                                                <td>
                                                    <span class="badge ${p.status === 'alive' ? 'badge-success' : p.status === 'dead' ? 'badge-danger' : 'badge-warning'}">
                                                        ${p.status}
                                                    </span>
                                                </td>
                                                <td>${p.responseTime ? p.responseTime + 'ms' : 'N/A'}</td>
                                                <td>${p.country || 'Unknown'}</td>
                                                <td>${this.app.formatDate(p.lastChecked)}</td>
                                                <td>
                                                    <div style="display: flex; gap: 4px;">
                                                        <button class="btn-icon proxy-check-one" data-id="${p.id}"><i class="fas fa-heartbeat"></i></button>
                                                        <button class="btn-icon proxy-delete" data-id="${p.id}" style="color: var(--accent-red);"><i class="fas fa-trash"></i></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;

        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('proxy-add')?.addEventListener('click', () => this.showAddModal());
        document.getElementById('proxy-import')?.addEventListener('click', () => this.showImportModal());
        document.getElementById('proxy-check-all')?.addEventListener('click', async () => {
            this.app.toast('info', 'Checking Proxies', 'This may take a while...');
            await ipcRenderer.invoke('check-all-proxies');
            this.app.toast('success', 'Check Complete', 'All proxies have been checked.');
            this.app.navigateTo('proxies');
        });

        document.querySelectorAll('.proxy-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                await ipcRenderer.invoke('delete-proxy', id);
                this.app.toast('success', 'Proxy Deleted', 'Proxy removed from list.');
                this.app.navigateTo('proxies');
            });
        });

        document.querySelectorAll('.proxy-check-one').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const proxies = await ipcRenderer.invoke('get-proxies');
                const proxy = proxies.find(p => p.id === id);
                if (proxy) {
                    const result = await ipcRenderer.invoke('check-proxy', proxy);
                    this.app.toast(result.alive ? 'success' : 'error', 'Proxy Check', result.alive ? `Alive (${result.responseTime}ms)` : 'Dead');
                    this.app.navigateTo('proxies');
                }
            });
        });
    }

    showAddModal() {
        const body = `
            <div class="input-group">
                <label class="input-label">Type</label>
                <select class="input-field" id="new-proxy-type">
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="socks4">SOCKS4</option>
                    <option value="socks5">SOCKS5</option>
                </select>
            </div>
            <div class="input-row">
                <div class="input-group">
                    <label class="input-label">Host</label>
                    <input class="input-field" id="new-proxy-host" placeholder="192.168.1.1">
                </div>
                <div class="input-group">
                    <label class="input-label">Port</label>
                    <input class="input-field" id="new-proxy-port" type="number" placeholder="8080">
                </div>
            </div>
            <div class="input-row">
                <div class="input-group">
                    <label class="input-label">Username (optional)</label>
                    <input class="input-field" id="new-proxy-user" placeholder="Username">
                </div>
                <div class="input-group">
                    <label class="input-label">Password (optional)</label>
                    <input class="input-field" id="new-proxy-pass" placeholder="Password">
                </div>
            </div>
        `;
        const footer = `
            <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="save-new-proxy">Add Proxy</button>
        `;
        this.app.openModal('Add Proxy', body, footer);

        document.getElementById('save-new-proxy').addEventListener('click', async () => {
            const proxy = {
                type: document.getElementById('new-proxy-type').value,
                host: document.getElementById('new-proxy-host').value,
                port: parseInt(document.getElementById('new-proxy-port').value),
                username: document.getElementById('new-proxy-user').value,
                password: document.getElementById('new-proxy-pass').value
            };
            await ipcRenderer.invoke('add-proxy', proxy);
            this.app.closeModal();
            this.app.toast('success', 'Proxy Added', `${proxy.host}:${proxy.port} added.`);
            this.app.navigateTo('proxies');
        });
    }

    showImportModal() {
        const body = `
            <div class="input-group">
                <label class="input-label">Type</label>
                <select class="input-field" id="import-proxy-type">
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="socks4">SOCKS4</option>
                    <option value="socks5">SOCKS5</option>
                </select>
            </div>
            <div class="input-group">
                <label class="input-label">Format: host:port or host:port:user:pass (one per line)</label>
                <textarea class="input-field" id="import-proxy-data" rows="10" placeholder="192.168.1.1:8080&#10;10.0.0.1:3128:user:pass"></textarea>
            </div>
        `;
        const footer = `
            <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="do-import-proxy">Import</button>
        `;
        this.app.openModal('Import Proxies', body, footer);

        document.getElementById('do-import-proxy').addEventListener('click', async () => {
            const type = document.getElementById('import-proxy-type').value;
            const text = document.getElementById('import-proxy-data').value;
            const result = await ipcRenderer.invoke('import-proxies', { text, type });
            this.app.closeModal();
            this.app.toast('success', 'Import Complete', `${result.imported} proxies imported.`);
            this.app.navigateTo('proxies');
        });
    }

    onProxyCheckResult(result) {
        this.app.navigateTo('proxies');
    }
}
