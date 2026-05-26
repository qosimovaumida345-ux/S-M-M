class DashboardPage {
    constructor(app) {
        this.app = app;
    }

    async render(container) {
        const stats = await ipcRenderer.invoke('get-dashboard-stats');
        this.app._lastStats = stats;
        const platforms = await ipcRenderer.invoke('get-supported-platforms');
        const accountCounts = await ipcRenderer.invoke('get-platform-accounts-count');

        container.innerHTML = `
            <div class="fade-in">
                <div class="page-header">
                    <div>
                        <h1 class="page-title">Dashboard</h1>
                        <p class="page-subtitle">Overview of your SMM automation system</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-secondary" id="dash-refresh">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                        <button class="btn btn-primary" id="dash-new-task">
                            <i class="fas fa-plus"></i> New Task
                        </button>
                    </div>
                </div>

                <div class="stat-grid">
                    <div class="stat-card purple">
                        <div class="stat-card-header">
                            <div class="stat-card-icon"><i class="fas fa-tasks"></i></div>
                        </div>
                        <div class="stat-card-value">${stats.totalTasks}</div>
                        <div class="stat-card-label">Total Tasks</div>
                    </div>
                    <div class="stat-card green">
                        <div class="stat-card-header">
                            <div class="stat-card-icon"><i class="fas fa-play-circle"></i></div>
                        </div>
                        <div class="stat-card-value">${stats.runningTasks}</div>
                        <div class="stat-card-label">Running Tasks</div>
                    </div>
                    <div class="stat-card blue">
                        <div class="stat-card-header">
                            <div class="stat-card-icon"><i class="fas fa-users"></i></div>
                        </div>
                        <div class="stat-card-value">${this.app.formatNumber(stats.totalAccounts)}</div>
                        <div class="stat-card-label">Total Accounts</div>
                    </div>
                    <div class="stat-card cyan">
                        <div class="stat-card-header">
                            <div class="stat-card-icon"><i class="fas fa-check-circle"></i></div>
                        </div>
                        <div class="stat-card-value">${this.app.formatNumber(stats.activeAccounts)}</div>
                        <div class="stat-card-label">Active Accounts</div>
                    </div>
                    <div class="stat-card yellow">
                        <div class="stat-card-header">
                            <div class="stat-card-icon"><i class="fas fa-shield-alt"></i></div>
                        </div>
                        <div class="stat-card-value">${stats.totalProxies}</div>
                        <div class="stat-card-label">Total Proxies</div>
                    </div>
                    <div class="stat-card red">
                        <div class="stat-card-header">
                            <div class="stat-card-icon"><i class="fas fa-bolt"></i></div>
                        </div>
                        <div class="stat-card-value">${this.app.formatNumber(stats.totalActionsCompleted)}</div>
                        <div class="stat-card-label">Actions Completed</div>
                    </div>
                </div>

                <div class="grid-2 mb-24">
                    <div class="card">
                        <div class="card-header">
                            <span class="card-title">Platforms</span>
                            <span class="text-sm text-muted">${platforms.length} supported</span>
                        </div>
                        <div class="card-body">
                            <div class="action-grid">
                                ${platforms.map(p => `
                                    <div class="action-card" data-platform="${p.id}" id="dash-platform-${p.id}">
                                        <div class="action-card-icon" style="background: ${this.getPlatformColor(p.id)}20; color: ${this.getPlatformColor(p.id)}">
                                            <i class="${this.getPlatformIcon(p.id)}"></i>
                                        </div>
                                        <div>
                                            <div class="action-card-text">${p.name}</div>
                                            <div class="text-sm text-muted">${accountCounts[p.id] || 0} accounts</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <span class="card-title">Recent Tasks</span>
                            <button class="btn btn-sm btn-secondary" id="dash-view-all-tasks">View All</button>
                        </div>
                        <div class="card-body" style="padding: 0;">
                            ${stats.recentTasks.length === 0 ? `
                                <div class="empty-state" style="padding: 30px;">
                                    <div class="empty-state-icon" style="width: 40px; height: 40px; font-size: 16px;"><i class="fas fa-inbox"></i></div>
                                    <div class="empty-state-desc">No tasks yet</div>
                                </div>
                            ` : `
                                <div class="table-wrapper">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Type</th>
                                                <th>Platform</th>
                                                <th>Status</th>
                                                <th>Progress</th>
                                                <th>Created</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${stats.recentTasks.map(t => `
                                                <tr>
                                                    <td>${t.type || t.action || 'N/A'}</td>
                                                    <td><span class="badge badge-info">${t.platform || 'N/A'}</span></td>
                                                    <td><span class="badge ${this.getStatusBadge(t.status)}">${t.status}</span></td>
                                                    <td>
                                                        <div style="display: flex; align-items: center; gap: 8px;">
                                                            <div class="progress-bar" style="width: 60px;">
                                                                <div class="progress-fill" style="width: ${t.progress || 0}%"></div>
                                                            </div>
                                                            <span class="text-sm">${t.progress || 0}%</span>
                                                        </div>
                                                    </td>
                                                    <td>${this.app.formatDate(t.createdAt)}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `}
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <span class="card-title">System Information</span>
                    </div>
                    <div class="card-body">
                        <div class="grid-4">
                            <div>
                                <div class="text-sm text-muted mb-8">Uptime</div>
                                <div class="font-bold">${this.app.formatDuration(stats.uptime)}</div>
                            </div>
                            <div>
                                <div class="text-sm text-muted mb-8">Completed Tasks</div>
                                <div class="font-bold" style="color: var(--accent-green);">${stats.completedTasks}</div>
                            </div>
                            <div>
                                <div class="text-sm text-muted mb-8">Failed Tasks</div>
                                <div class="font-bold" style="color: var(--accent-red);">${stats.failedTasks}</div>
                            </div>
                            <div>
                                <div class="text-sm text-muted mb-8">Alive Proxies</div>
                                <div class="font-bold" style="color: var(--accent-cyan);">${stats.aliveProxies} / ${stats.totalProxies}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents(platforms);
    }

    bindEvents(platforms) {
        document.getElementById('dash-refresh')?.addEventListener('click', () => {
            this.app.navigateTo('dashboard');
        });
        document.getElementById('dash-new-task')?.addEventListener('click', () => {
            this.app.navigateTo('tasks');
        });
        document.getElementById('dash-view-all-tasks')?.addEventListener('click', () => {
            this.app.navigateTo('tasks');
        });
        platforms.forEach(p => {
            document.getElementById(`dash-platform-${p.id}`)?.addEventListener('click', () => {
                this.app.navigateTo(`platform-${p.id}`);
            });
        });
    }

    async refresh() {
        const container = document.getElementById('page-container');
        if (container && this.app.currentPage === 'dashboard') {
            await this.render(container);
        }
    }

    getPlatformColor(id) {
        const colors = {
            instagram: '#E1306C', youtube: '#FF0000', telegram: '#0088CC',
            tiktok: '#69C9D0', discord: '#5865F2', twitter: '#1DA1F2',
            roblox: '#E2231A', facebook: '#1877F2', spotify: '#1DB954',
            twitch: '#9146FF', google: '#4285F4'
        };
        return colors[id] || '#6366f1';
    }

    getPlatformIcon(id) {
        const icons = {
            instagram: 'fab fa-instagram', youtube: 'fab fa-youtube', telegram: 'fab fa-telegram',
            tiktok: 'fab fa-tiktok', discord: 'fab fa-discord', twitter: 'fab fa-x-twitter',
            roblox: 'fas fa-gamepad', facebook: 'fab fa-facebook', spotify: 'fab fa-spotify',
            twitch: 'fab fa-twitch', google: 'fab fa-google'
        };
        return icons[id] || 'fas fa-globe';
    }

    getStatusBadge(status) {
        const map = {
            pending: 'badge-warning', running: 'badge-info',
            completed: 'badge-success', failed: 'badge-danger',
            stopped: 'badge-purple'
        };
        return map[status] || 'badge-info';
    }
}
