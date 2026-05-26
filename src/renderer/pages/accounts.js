class AccountsPage {
    constructor(app) {
        this.app = app;
        this.selectedPlatform = 'all';
        this.searchQuery = '';
    }

    async render(container) {
        const accounts = await ipcRenderer.invoke('get-accounts');
        const platforms = await ipcRenderer.invoke('get-supported-platforms');
        const accountCounts = await ipcRenderer.invoke('get-platform-accounts-count');

        let filtered = accounts;
        if (this.selectedPlatform !== 'all') {
            filtered = filtered.filter(a => a.platform === this.selectedPlatform);
        }
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            filtered = filtered.filter(a =>
                (a.username && a.username.toLowerCase().includes(q)) ||
                (a.email && a.email.toLowerCase().includes(q)) ||
                (a.phone && a.phone.includes(q))
            );
        }

        container.innerHTML = `
            <div class="fade-in">
                <div class="page-header">
                    <div>
                        <h1 class="page-title">Account Vault</h1>
                        <p class="page-subtitle">${accounts.length} accounts across ${Object.keys(accountCounts).length} platforms</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-secondary" id="acc-import">
                            <i class="fas fa-file-import"></i> Import
                        </button>
                        <button class="btn btn-secondary" id="acc-export">
                            <i class="fas fa-file-export"></i> Export
                        </button>
                        <button class="btn btn-primary" id="acc-add">
                            <i class="fas fa-plus"></i> Add Account
                        </button>
                    </div>
                </div>

                <div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;">
                    <div class="tabs" id="acc-platform-tabs">
                        <button class="tab ${this.selectedPlatform === 'all' ? 'active' : ''}" data-platform="all">All (${accounts.length})</button>
                        ${platforms.filter(p => accountCounts[p.id]).map(p => `
                            <button class="tab ${this.selectedPlatform === p.id ? 'active' : ''}" data-platform="${p.id}">
                                ${p.name} (${accountCounts[p.id] || 0})
                            </button>
                        `).join('')}
                    </div>
                    <div class="search-box" style="flex: 1; min-width: 200px;">
                        <i class="fas fa-search"></i>
                        <input type="text" class="input-field" id="acc-search" placeholder="Search accounts..." value="${this.searchQuery}">
                    </div>
                </div>

                <div class="card">
                    <div class="card-body" style="padding: 0;">
                        ${filtered.length === 0 ? `
                            <div class="empty-state">
                                <div class="empty-state-icon"><i class="fas fa-user-slash"></i></div>
                                <div class="empty-state-title">No Accounts Found</div>
                                <div class="empty-state-desc">Add accounts manually or import them from a file to get started.</div>
                                <button class="btn btn-primary" id="acc-add-empty">
                                    <i class="fas fa-plus"></i> Add Account
                                </button>
                            </div>
                        ` : `
                            <div class="table-wrapper">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Platform</th>
                                            <th>Username</th>
                                            <th>Email</th>
                                            <th>Phone</th>
                                            <th>Status</th>
                                            <th>Proxy</th>
                                            <th>Created</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${filtered.map(acc => `
                                            <tr data-id="${acc.id}" data-platform="${acc.platform}">
                                                <td><span class="badge badge-info">${acc.platform}</span></td>
                                                <td style="color: var(--text-primary); font-weight: 600;">${acc.username || 'N/A'}</td>
                                                <td>${acc.email || 'N/A'}</td>
                                                <td>${acc.phone || 'N/A'}</td>
                                                <td><span class="badge ${acc.status === 'active' ? 'badge-success' : acc.status === 'banned' ? 'badge-danger' : 'badge-warning'}">${acc.status || 'unknown'}</span></td>
                                                <td>${acc.proxy ? `<span class="chip"><i class="fas fa-shield-alt"></i>${acc.proxy}</span>` : '<span class="text-muted">None</span>'}</td>
                                                <td>${this.app.formatDate(acc.createdAt)}</td>
                                                <td>
                                                    <div style="display: flex; gap: 4px;">
                                                        <button class="btn-icon acc-edit" data-id="${acc.id}" data-platform="${acc.platform}"><i class="fas fa-edit"></i></button>
                                                        <button class="btn-icon acc-delete" data-id="${acc.id}" data-platform="${acc.platform}" style="color: var(--accent-red);"><i class="fas fa-trash"></i></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `}
                    </div>
                    <div class="card-footer">
                        <span class="text-sm text-muted">Showing ${filtered.length} of ${accounts.length} accounts</span>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents(platforms);
    }

    bindEvents(platforms) {
        document.querySelectorAll('#acc-platform-tabs .tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.selectedPlatform = tab.getAttribute('data-platform');
                this.app.navigateTo('accounts');
            });
        });

        document.getElementById('acc-search')?.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            clearTimeout(this._searchTimeout);
            this._searchTimeout = setTimeout(() => {
                this.app.navigateTo('accounts');
            }, 300);
        });

        document.getElementById('acc-add')?.addEventListener('click', () => this.showAddModal(platforms));
        document.getElementById('acc-add-empty')?.addEventListener('click', () => this.showAddModal(platforms));

        document.getElementById('acc-import')?.addEventListener('click', () => this.showImportModal(platforms));
        document.getElementById('acc-export')?.addEventListener('click', () => this.exportAccounts());

        document.querySelectorAll('.acc-edit').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const platform = btn.getAttribute('data-platform');
                const accounts = await ipcRenderer.invoke('get-accounts', platform);
                const account = accounts.find(a => a.id === id);
                if (account) this.showEditModal(account, platforms);
            });
        });

        document.querySelectorAll('.acc-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const platform = btn.getAttribute('data-platform');
                await ipcRenderer.invoke('delete-account', { platform, id });
                this.app.toast('success', 'Account Deleted', 'Account has been removed from the vault.');
                this.app.navigateTo('accounts');
            });
        });
    }

    showAddModal(platforms) {
        const body = `
            <div class="input-group">
                <label class="input-label">Platform</label>
                <select class="input-field" id="new-acc-platform">
                    ${platforms.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                </select>
            </div>
            <div class="input-group">
                <label class="input-label">Username</label>
                <input class="input-field" id="new-acc-username" placeholder="Enter username">
            </div>
            <div class="input-group">
                <label class="input-label">Password</label>
                <input class="input-field" id="new-acc-password" type="password" placeholder="Enter password">
            </div>
            <div class="input-row">
                <div class="input-group">
                    <label class="input-label">Email</label>
                    <input class="input-field" id="new-acc-email" placeholder="Email address">
                </div>
                <div class="input-group">
                    <label class="input-label">Phone</label>
                    <input class="input-field" id="new-acc-phone" placeholder="Phone number">
                </div>
            </div>
            <div class="input-group">
                <label class="input-label">Proxy (host:port or host:port:user:pass)</label>
                <input class="input-field" id="new-acc-proxy" placeholder="Optional proxy">
            </div>
        `;
        const footer = `
            <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="save-new-acc">Save Account</button>
        `;
        this.app.openModal('Add New Account', body, footer);

        document.getElementById('save-new-acc').addEventListener('click', async () => {
            const account = {
                platform: document.getElementById('new-acc-platform').value,
                username: document.getElementById('new-acc-username').value,
                password: document.getElementById('new-acc-password').value,
                email: document.getElementById('new-acc-email').value,
                phone: document.getElementById('new-acc-phone').value,
                proxy: document.getElementById('new-acc-proxy').value,
                status: 'active'
            };
            await ipcRenderer.invoke('save-account', account);
            this.app.closeModal();
            this.app.toast('success', 'Account Added', `${account.username} has been saved.`);
            this.app.navigateTo('accounts');
        });
    }

    showEditModal(account, platforms) {
        const body = `
            <div class="input-group">
                <label class="input-label">Platform</label>
                <select class="input-field" id="edit-acc-platform" disabled>
                    ${platforms.map(p => `<option value="${p.id}" ${p.id === account.platform ? 'selected' : ''}>${p.name}</option>`).join('')}
                </select>
            </div>
            <div class="input-group">
                <label class="input-label">Username</label>
                <input class="input-field" id="edit-acc-username" value="${account.username || ''}">
            </div>
            <div class="input-group">
                <label class="input-label">Password</label>
                <input class="input-field" id="edit-acc-password" type="password" value="${account.password || ''}">
            </div>
            <div class="input-row">
                <div class="input-group">
                    <label class="input-label">Email</label>
                    <input class="input-field" id="edit-acc-email" value="${account.email || ''}">
                </div>
                <div class="input-group">
                    <label class="input-label">Phone</label>
                    <input class="input-field" id="edit-acc-phone" value="${account.phone || ''}">
                </div>
            </div>
            <div class="input-group">
                <label class="input-label">Proxy</label>
                <input class="input-field" id="edit-acc-proxy" value="${account.proxy || ''}">
            </div>
            <div class="input-group">
                <label class="input-label">Status</label>
                <select class="input-field" id="edit-acc-status">
                    <option value="active" ${account.status === 'active' ? 'selected' : ''}>Active</option>
                    <option value="banned" ${account.status === 'banned' ? 'selected' : ''}>Banned</option>
                    <option value="inactive" ${account.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                    <option value="verifying" ${account.status === 'verifying' ? 'selected' : ''}>Verifying</option>
                </select>
            </div>
        `;
        const footer = `
            <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="save-edit-acc">Update Account</button>
        `;
        this.app.openModal('Edit Account', body, footer);

        document.getElementById('save-edit-acc').addEventListener('click', async () => {
            account.username = document.getElementById('edit-acc-username').value;
            account.password = document.getElementById('edit-acc-password').value;
            account.email = document.getElementById('edit-acc-email').value;
            account.phone = document.getElementById('edit-acc-phone').value;
            account.proxy = document.getElementById('edit-acc-proxy').value;
            account.status = document.getElementById('edit-acc-status').value;
            await ipcRenderer.invoke('save-account', account);
            this.app.closeModal();
            this.app.toast('success', 'Account Updated', `${account.username} has been updated.`);
            this.app.navigateTo('accounts');
        });
    }

    showImportModal(platforms) {
        const body = `
            <div class="input-group">
                <label class="input-label">Platform</label>
                <select class="input-field" id="import-platform">
                    ${platforms.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                </select>
            </div>
            <div class="input-group">
                <label class="input-label">Format: username:password:email:phone (one per line)</label>
                <textarea class="input-field" id="import-data" rows="10" placeholder="user1:pass1:email1@mail.com:+1234567890&#10;user2:pass2:email2@mail.com:+0987654321"></textarea>
            </div>
        `;
        const footer = `
            <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="do-import">Import</button>
        `;
        this.app.openModal('Import Accounts', body, footer);

        document.getElementById('do-import').addEventListener('click', async () => {
            const platform = document.getElementById('import-platform').value;
            const data = document.getElementById('import-data').value;
            const lines = data.split('\n').filter(l => l.trim());
            const accounts = lines.map(line => {
                const parts = line.split(':');
                return {
                    username: parts[0] || '',
                    password: parts[1] || '',
                    email: parts[2] || '',
                    phone: parts[3] || '',
                    status: 'active'
                };
            });
            const result = await ipcRenderer.invoke('import-accounts', { platform, accounts });
            this.app.closeModal();
            this.app.toast('success', 'Import Complete', `${result.imported} accounts imported.`);
            this.app.navigateTo('accounts');
        });
    }

    async exportAccounts() {
        const platform = this.selectedPlatform === 'all' ? null : this.selectedPlatform;
        const accounts = await ipcRenderer.invoke('get-accounts', platform);
        const lines = accounts.map(a => `${a.username || ''}:${a.password || ''}:${a.email || ''}:${a.phone || ''}`);
        const text = lines.join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `accounts-${platform || 'all'}-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        this.app.toast('success', 'Export Complete', `${accounts.length} accounts exported.`);
    }
}
