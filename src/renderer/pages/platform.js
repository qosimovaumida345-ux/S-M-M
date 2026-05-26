class PlatformPage {
    constructor(app, platformId) {
        this.app = app;
        this.platformId = platformId;
    }

    async render(container) {
        const platforms = await ipcRenderer.invoke('get-supported-platforms');
        const platform = platforms.find(p => p.id === this.platformId);
        if (!platform) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Platform Not Found</div></div>';
            return;
        }
        const accounts = await ipcRenderer.invoke('get-accounts', this.platformId);
        const tasks = await ipcRenderer.invoke('get-tasks');
        const platformTasks = tasks.filter(t => t.platform === this.platformId);
        const activeAccounts = accounts.filter(a => a.status === 'active').length;
        const bannedAccounts = accounts.filter(a => a.status === 'banned').length;

        container.innerHTML = `
            <div class="fade-in">
                <div class="page-header">
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <div class="platform-card-icon platform-${this.platformId}" style="width: 48px; height: 48px; font-size: 20px; border-radius: var(--radius-md);">
                            <i class="${this.getIcon()}"></i>
                        </div>
                        <div>
                            <h1 class="page-title">${platform.name}</h1>
                            <p class="page-subtitle">${platform.actions.length} available actions</p>
                        </div>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-secondary" id="plat-create-accounts">
                            <i class="fas fa-user-plus"></i> Create Accounts
                        </button>
                        <button class="btn btn-primary" id="plat-new-task">
                            <i class="fas fa-plus"></i> New Task
                        </button>
                    </div>
                </div>

                <div class="stat-grid mb-24">
                    <div class="stat-card blue">
                        <div class="stat-card-header">
                            <div class="stat-card-icon"><i class="fas fa-users"></i></div>
                        </div>
                        <div class="stat-card-value">${accounts.length}</div>
                        <div class="stat-card-label">Total Accounts</div>
                    </div>
                    <div class="stat-card green">
                        <div class="stat-card-header">
                            <div class="stat-card-icon"><i class="fas fa-check-circle"></i></div>
                        </div>
                        <div class="stat-card-value">${activeAccounts}</div>
                        <div class="stat-card-label">Active</div>
                    </div>
                    <div class="stat-card red">
                        <div class="stat-card-header">
                            <div class="stat-card-icon"><i class="fas fa-ban"></i></div>
                        </div>
                        <div class="stat-card-value">${bannedAccounts}</div>
                        <div class="stat-card-label">Banned</div>
                    </div>
                    <div class="stat-card purple">
                        <div class="stat-card-header">
                            <div class="stat-card-icon"><i class="fas fa-tasks"></i></div>
                        </div>
                        <div class="stat-card-value">${platformTasks.length}</div>
                        <div class="stat-card-label">Tasks</div>
                    </div>
                </div>

                <div class="card mb-24">
                    <div class="card-header"><span class="card-title">Available Actions</span></div>
                    <div class="card-body">
                        <div class="action-grid">
                            ${platform.actions.map(action => `
                                <div class="action-card plat-action" data-action="${action}">
                                    <div class="action-card-icon">
                                        <i class="fas ${this.getActionIcon(action)}"></i>
                                    </div>
                                    <div class="action-card-text">${action.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <span class="card-title">Recent Accounts</span>
                        <button class="btn btn-sm btn-secondary" id="plat-view-all-accounts">View All</button>
                    </div>
                    <div class="card-body" style="padding: 0;">
                        ${accounts.length === 0 ? `
                            <div class="empty-state" style="padding: 30px;">
                                <div class="text-sm text-muted">No ${platform.name} accounts yet.</div>
                            </div>
                        ` : `
                            <div class="table-wrapper">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Username</th>
                                            <th>Email</th>
                                            <th>Status</th>
                                            <th>Proxy</th>
                                            <th>Created</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${accounts.slice(0, 10).map(acc => `
                                            <tr>
                                                <td style="font-weight: 600; color: var(--text-primary);">${acc.username || 'N/A'}</td>
                                                <td>${acc.email || 'N/A'}</td>
                                                <td><span class="badge ${acc.status === 'active' ? 'badge-success' : 'badge-danger'}">${acc.status}</span></td>
                                                <td>${acc.proxy || '<span class="text-muted">None</span>'}</td>
                                                <td>${this.app.formatDate(acc.createdAt)}</td>
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

        this.bindEvents(platform);
    }

    bindEvents(platform) {
        document.getElementById('plat-new-task')?.addEventListener('click', () => {
            this.app.navigateTo('tasks');
        });

        document.getElementById('plat-view-all-accounts')?.addEventListener('click', () => {
            this.app.navigateTo('accounts');
        });

        document.getElementById('plat-create-accounts')?.addEventListener('click', () => {
            const body = `
                <div class="input-group">
                    <label class="input-label">Number of Accounts</label>
                    <input class="input-field" id="bulk-count" type="number" value="10" min="1" max="1000">
                </div>
                <div class="switch-group">
                    <div class="switch-label">
                        <span class="switch-label-text">Use Proxies</span>
                        <span class="switch-label-desc">Assign unique proxy to each account</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="bulk-proxy" checked>
                        <span class="switch-slider"></span>
                    </label>
                </div>
                <div class="switch-group">
                    <div class="switch-label">
                        <span class="switch-label-text">SMS Verification</span>
                        <span class="switch-label-desc">Auto-verify with free SMS services</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="bulk-sms" checked>
                        <span class="switch-slider"></span>
                    </label>
                </div>
            `;
            const footer = `
                <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancel</button>
                <button class="btn btn-primary" id="bulk-create-start">Start Creating</button>
            `;
            this.app.openModal(`Create ${platform.name} Accounts`, body, footer);

            document.getElementById('bulk-create-start')?.addEventListener('click', async () => {
                const count = parseInt(document.getElementById('bulk-count').value);
                const useProxy = document.getElementById('bulk-proxy').checked;
                const useVerification = document.getElementById('bulk-sms').checked;
                const result = await ipcRenderer.invoke('create-accounts-bulk', {
                    platform: this.platformId,
                    count,
                    useProxy,
                    useVerification
                });
                this.app.closeModal();
                if (result.success) {
                    this.app.toast('success', 'Account Creation Started', `Creating ${count} accounts...`);
                    this.app.navigateTo('tasks');
                } else {
                    this.app.toast('error', 'Failed', result.error);
                }
            });
        });

        document.querySelectorAll('.plat-action').forEach(card => {
            card.addEventListener('click', () => {
                this.app.navigateTo('tasks');
            });
        });
    }

    getIcon() {
        const icons = {
            instagram: 'fab fa-instagram', youtube: 'fab fa-youtube', telegram: 'fab fa-telegram',
            tiktok: 'fab fa-tiktok', discord: 'fab fa-discord', twitter: 'fab fa-x-twitter',
            roblox: 'fas fa-gamepad', facebook: 'fab fa-facebook', spotify: 'fab fa-spotify',
            twitch: 'fab fa-twitch', google: 'fab fa-google'
        };
        return icons[this.platformId] || 'fas fa-globe';
    }

    getActionIcon(action) {
        const icons = {
            follow: 'fa-user-plus', like: 'fa-heart', comment: 'fa-comment',
            subscribe: 'fa-bell', view: 'fa-eye', share: 'fa-share',
            retweet: 'fa-retweet', 'join-channel': 'fa-sign-in-alt', 'join-group': 'fa-users',
            'send-message': 'fa-paper-plane', 'add-member': 'fa-user-plus',
            'view-story': 'fa-eye', 'view-post': 'fa-eye', 'like-page': 'fa-thumbs-up',
            'like-post': 'fa-heart', 'join-server': 'fa-sign-in-alt', react: 'fa-smile',
            favorite: 'fa-star', gamepass: 'fa-ticket-alt', play: 'fa-play',
            save: 'fa-bookmark', 'playlist-add': 'fa-list', chat: 'fa-comment-dots',
            'create-account': 'fa-user-plus', dislike: 'fa-thumbs-down'
        };
        return icons[action] || 'fa-bolt';
    }
}
