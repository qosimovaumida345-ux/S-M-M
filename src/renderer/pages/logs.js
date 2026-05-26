class LogsPage {
    constructor(app) {
        this.app = app;
    }

    async render(container) {
        const logs = await ipcRenderer.invoke('get-logs', { limit: 100, offset: 0 });

        container.innerHTML = `
            <div class="fade-in">
                <div class="page-header">
                    <div>
                        <h1 class="page-title">System Logs</h1>
                        <p class="page-subtitle">${logs.length} log files</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-danger btn-sm" id="logs-clear">
                            <i class="fas fa-trash"></i> Clear All Logs
                        </button>
                        <button class="btn btn-secondary" id="logs-refresh">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body" style="padding: 0; max-height: 600px; overflow-y: auto; font-family: 'JetBrains Mono', 'Fira Code', monospace;">
                        ${logs.length === 0 ? `
                            <div class="empty-state" style="padding: 40px;">
                                <div class="empty-state-icon"><i class="fas fa-terminal"></i></div>
                                <div class="empty-state-title">No Logs</div>
                                <div class="empty-state-desc">System logs will appear here as tasks run and events occur.</div>
                            </div>
                        ` : logs.map(log => `
                            <div class="log-entry">
                                <span class="log-time">${new Date(log.time).toLocaleString()}</span>
                                <span class="log-level ${log.name.includes('crash') ? 'error' : log.name.includes('rejection') ? 'warn' : 'info'}">
                                    ${log.name.includes('crash') ? 'ERROR' : log.name.includes('rejection') ? 'WARN' : 'INFO'}
                                </span>
                                <span class="log-message">${log.content.substring(0, 500)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        document.getElementById('logs-clear')?.addEventListener('click', async () => {
            await ipcRenderer.invoke('clear-logs');
            this.app.toast('success', 'Logs Cleared', 'All log files removed.');
            this.app.navigateTo('logs');
        });

        document.getElementById('logs-refresh')?.addEventListener('click', () => {
            this.app.navigateTo('logs');
        });
    }
}
