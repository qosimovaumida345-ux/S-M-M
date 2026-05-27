const { ipcRenderer } = require('electron');

class App {
    constructor() {
        this.currentPage = 'dashboard';
        this.pages = {};
        this.config = {};
        this.refreshInterval = null;
    }

    async init() {
        this.config = await ipcRenderer.invoke('get-config');
        this.setupTitlebar();
        this.setupNavigation();
        this.setupModal();
        this.setupContextMenu();
        this.setupIpcListeners();
        this.updateWorkerInfo();
        
        if (!this.config.groqApiKey && !this.config.envGroqApiKey) {
            this.showGroqKeyModal();
        }

        this.navigateTo('dashboard');
        this.startAutoRefresh();
    }

    showGroqKeyModal() {
        const bodyContent = `
            <div style="text-align:center; padding: 20px;">
                <div style="font-size: 48px; color: #8b5cf6; margin-bottom: 20px;"><i class="fas fa-robot"></i></div>
                <h2 style="margin-bottom: 15px;">Groq API Key Required</h2>
                <p style="color: var(--text-muted); margin-bottom: 25px;">To run stealth automation and bypass Captchas with AI Vision, you must provide a valid Groq API Key.</p>
                <div class="input-group">
                    <input type="password" class="input-field" id="groq-startup-key" placeholder="gsk_...">
                </div>
                <div id="groq-test-res" style="color:var(--accent-red); font-size:13px; margin-top:10px;"></div>
            </div>
        `;
        const footerContent = `
            <button class="btn btn-primary" id="groq-submit" style="width: 100%;">
                <i class="fas fa-check"></i> Verify & Save
            </button>
        `;
        
        this.openModal('Setup Required', bodyContent, footerContent);
        
        // Prevent closing
        document.getElementById('modal-close').style.display = 'none';
        
        document.getElementById('groq-submit').addEventListener('click', async () => {
            const btn = document.getElementById('groq-submit');
            const resDiv = document.getElementById('groq-test-res');
            const key = document.getElementById('groq-startup-key').value.trim();
            if(!key) return;
            
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
            btn.disabled = true;
            
            const res = await ipcRenderer.invoke('check-groq-key', key);
            if (res.valid) {
                 await ipcRenderer.invoke('set-groq-key', key);
                 this.config.groqApiKey = key;
                 document.getElementById('modal-overlay').style.display = 'none'; // force close
                 document.getElementById('modal-close').style.display = 'block'; // restore for future modals
                 this.toast('success', 'AI Vision Active', 'Groq API Key successfully linked.');
            } else {
                 resDiv.innerText = 'Invalid Key: ' + res.error;
                 btn.innerHTML = '<i class="fas fa-check"></i> Verify & Save';
                 btn.disabled = false;
            }
        });
    }

    setupTitlebar() {
        document.getElementById('btn-minimize').addEventListener('click', () => {
            ipcRenderer.invoke('window-minimize');
        });
        document.getElementById('btn-maximize').addEventListener('click', () => {
            ipcRenderer.invoke('window-maximize');
        });
        document.getElementById('btn-close').addEventListener('click', () => {
            ipcRenderer.invoke('window-close');
        });
        ipcRenderer.on('window-state-changed', (event, { maximized }) => {
            const btn = document.getElementById('btn-maximize');
            btn.innerHTML = maximized ? '<i class="far fa-clone"></i>' : '<i class="far fa-square"></i>';
        });
    }

    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.getAttribute('data-page');
                this.navigateTo(page);
            });
        });
        ipcRenderer.on('navigate', (event, page) => {
            this.navigateTo(page);
        });
    }

    setupModal() {
        const overlay = document.getElementById('modal-overlay');
        const closeBtn = document.getElementById('modal-close');
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeModal();
        });
        closeBtn.addEventListener('click', () => this.closeModal());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                this.hideContextMenu();
            }
        });
    }

    setupContextMenu() {
        document.addEventListener('click', () => {
            this.hideContextMenu();
        });
    }

    setupIpcListeners() {
        ipcRenderer.on('task-progress', (event, update) => {
            if (this.currentPage === 'tasks' && this.pages.tasks) {
                this.pages.tasks.onTaskProgress(update);
            }
            if (this.currentPage === 'dashboard' && this.pages.dashboard) {
                this.pages.dashboard.refresh();
            }
            this.updateTaskBadge();
        });

        ipcRenderer.on('proxy-check-result', (event, result) => {
            if (this.currentPage === 'proxies' && this.pages.proxies) {
                this.pages.proxies.onProxyCheckResult(result);
            }
        });
    }

    async updateWorkerInfo() {
        const nameEl = document.getElementById('worker-name');
        const uptimeEl = document.getElementById('worker-uptime');
        if (this.config.workerName) {
            nameEl.textContent = this.config.workerName;
        }
        const updateUptime = () => {
            const stats = this._lastStats;
            if (stats && stats.uptime) {
                const hours = Math.floor(stats.uptime / 3600);
                const mins = Math.floor((stats.uptime % 3600) / 60);
                uptimeEl.textContent = `Uptime: ${hours}h ${mins}m`;
            }
        };
        setInterval(updateUptime, 60000);
    }

    async updateTaskBadge() {
        const stats = await ipcRenderer.invoke('get-dashboard-stats');
        const badge = document.getElementById('running-tasks-badge');
        badge.textContent = stats.runningTasks || 0;
        badge.style.display = stats.runningTasks > 0 ? 'inline-flex' : 'none';
    }

    navigateTo(page) {
        this.currentPage = page;
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-page') === page);
        });
        this.renderPage(page);
    }

    async renderPage(page) {
        const container = document.getElementById('page-container');
        container.innerHTML = '<div class="loading-overlay"><div class="loading-spinner"></div><span>Loading...</span></div>';

        try {
            if (page === 'dashboard') {
                if (!this.pages.dashboard) this.pages.dashboard = new DashboardPage(this);
                await this.pages.dashboard.render(container);
            } else if (page === 'tasks') {
                if (!this.pages.tasks) this.pages.tasks = new TasksPage(this);
                await this.pages.tasks.render(container);
            } else if (page === 'accounts') {
                if (!this.pages.accounts) this.pages.accounts = new AccountsPage(this);
                await this.pages.accounts.render(container);
            } else if (page === 'proxies') {
                if (!this.pages.proxies) this.pages.proxies = new ProxiesPage(this);
                await this.pages.proxies.render(container);
            } else if (page === 'settings') {
                if (!this.pages.settings) this.pages.settings = new SettingsPage(this);
                await this.pages.settings.render(container);
            } else if (page === 'sms') {
                if (!this.pages.sms) this.pages.sms = new SmsPage(this);
                await this.pages.sms.render(container);
            } else if (page === 'captcha') {
                if (!this.pages.captcha) this.pages.captcha = new CaptchaPage(this);
                await this.pages.captcha.render(container);
            } else if (page === 'logs') {
                if (!this.pages.logs) this.pages.logs = new LogsPage(this);
                await this.pages.logs.render(container);
            } else if (page.startsWith('platform-')) {
                const platformId = page.replace('platform-', '');
                if (!this.pages[page]) this.pages[page] = new PlatformPage(this, platformId);
                await this.pages[page].render(container);
            }
        } catch (err) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-exclamation-triangle"></i></div>
                    <div class="empty-state-title">Error Loading Page</div>
                    <div class="empty-state-desc">${err.message}</div>
                    <button class="btn btn-primary" onclick="window.app.navigateTo('dashboard')">
                        <i class="fas fa-home"></i> Go to Dashboard
                    </button>
                </div>
            `;
        }
    }

    openModal(title, bodyHtml, footerHtml) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = bodyHtml;
        document.getElementById('modal-footer').innerHTML = footerHtml || '';
        document.getElementById('modal-overlay').style.display = 'flex';
    }

    closeModal() {
        document.getElementById('modal-overlay').style.display = 'none';
    }

    showContextMenu(x, y, items) {
        const menu = document.getElementById('context-menu');
        let html = '';
        for (const item of items) {
            if (item.divider) {
                html += '<div class="context-menu-divider"></div>';
            } else {
                html += `<div class="context-menu-item" data-action="${item.action}">`;
                if (item.icon) html += `<i class="${item.icon}"></i>`;
                html += `<span>${item.label}</span></div>`;
            }
        }
        menu.innerHTML = html;
        menu.style.display = 'block';
        menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
        menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';

        menu.querySelectorAll('.context-menu-item').forEach(el => {
            el.addEventListener('click', () => {
                const action = el.getAttribute('data-action');
                const item = items.find(i => i.action === action);
                if (item && item.handler) item.handler();
                this.hideContextMenu();
            });
        });
    }

    hideContextMenu() {
        document.getElementById('context-menu').style.display = 'none';
    }

    toast(type, title, message) {
        const container = document.getElementById('toast-container');
        const icons = { success: 'fa-check', error: 'fa-times', warning: 'fa-exclamation', info: 'fa-info' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-icon"><i class="fas ${icons[type] || icons.info}"></i></div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                ${message ? `<div class="toast-message">${message}</div>` : ''}
            </div>
            <button class="toast-close"><i class="fas fa-times"></i></button>
        `;
        container.appendChild(toast);
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        });
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('removing');
                setTimeout(() => toast.remove(), 300);
            }
        }, 4000);
    }

    startAutoRefresh() {
        this.refreshInterval = setInterval(async () => {
            this._lastStats = await ipcRenderer.invoke('get-dashboard-stats');
            this.updateTaskBadge();
        }, 5000);
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return String(num);
    }

    formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        const d = new Date(dateStr);
        const now = new Date();
        const diff = now - d;
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
        return d.toLocaleDateString();
    }

    formatDuration(seconds) {
        if (!seconds) return '0s';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    }
}
