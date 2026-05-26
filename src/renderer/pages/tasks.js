class TasksPage {
    constructor(app) {
        this.app = app;
        this.filterStatus = 'all';
    }

    async render(container) {
        const tasks = await ipcRenderer.invoke('get-tasks');
        const platforms = await ipcRenderer.invoke('get-supported-platforms');
        let filtered = tasks;
        if (this.filterStatus !== 'all') {
            filtered = filtered.filter(t => t.status === this.filterStatus);
        }
        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const statusCounts = { all: tasks.length, pending: 0, running: 0, completed: 0, failed: 0, stopped: 0 };
        tasks.forEach(t => { if (statusCounts[t.status] !== undefined) statusCounts[t.status]++; });

        container.innerHTML = `
            <div class="fade-in">
                <div class="page-header">
                    <div>
                        <h1 class="page-title">Task Manager</h1>
                        <p class="page-subtitle">${tasks.length} total tasks | ${statusCounts.running} running</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-secondary" id="task-clear-done">
                            <i class="fas fa-broom"></i> Clear Completed
                        </button>
                        <button class="btn btn-primary" id="task-create">
                            <i class="fas fa-plus"></i> Create Task
                        </button>
                    </div>
                </div>

                <div class="tabs" id="task-status-tabs" style="margin-bottom: 20px;">
                    ${Object.entries(statusCounts).map(([status, count]) => `
                        <button class="tab ${this.filterStatus === status ? 'active' : ''}" data-status="${status}">
                            ${status.charAt(0).toUpperCase() + status.slice(1)} (${count})
                        </button>
                    `).join('')}
                </div>

                ${filtered.length === 0 ? `
                    <div class="card">
                        <div class="empty-state">
                            <div class="empty-state-icon"><i class="fas fa-clipboard-list"></i></div>
                            <div class="empty-state-title">No Tasks</div>
                            <div class="empty-state-desc">Create a new task to start automating actions across your platforms.</div>
                            <button class="btn btn-primary" id="task-create-empty">
                                <i class="fas fa-plus"></i> Create Task
                            </button>
                        </div>
                    </div>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${filtered.map(t => `
                            <div class="card task-card" data-id="${t.id}" style="margin-bottom: 0;">
                                <div class="card-body" style="padding: 16px 20px;">
                                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                                        <div style="display: flex; align-items: center; gap: 12px;">
                                            <span class="badge ${this.getStatusBadge(t.status)}">${t.status}</span>
                                            <span style="font-weight: 700; color: var(--text-primary);">${t.type || t.action || 'Task'}</span>
                                            <span class="badge badge-info">${t.platform || 'N/A'}</span>
                                        </div>
                                        <div style="display: flex; gap: 6px;">
                                            ${t.status === 'pending' || t.status === 'stopped' ? `
                                                <button class="btn btn-sm btn-success task-start" data-id="${t.id}">
                                                    <i class="fas fa-play"></i> Start
                                                </button>
                                            ` : ''}
                                            ${t.status === 'running' ? `
                                                <button class="btn btn-sm btn-danger task-stop" data-id="${t.id}">
                                                    <i class="fas fa-stop"></i> Stop
                                                </button>
                                            ` : ''}
                                            <button class="btn-icon task-delete" data-id="${t.id}" style="color: var(--accent-red);">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 8px;">
                                        <div class="progress-bar" style="flex: 1;">
                                            <div class="progress-fill" style="width: ${t.progress || 0}%"></div>
                                        </div>
                                        <span class="text-sm" style="min-width: 40px; text-align: right;">${t.progress || 0}%</span>
                                    </div>
                                    <div style="display: flex; gap: 20px;" class="text-sm text-muted">
                                        <span>Target: ${t.targetUrl || t.target || 'N/A'}</span>
                                        <span>Count: ${t.count || 0}</span>
                                        <span>Done: <span style="color: var(--accent-green);">${t.completed || 0}</span></span>
                                        <span>Failed: <span style="color: var(--accent-red);">${t.failed || 0}</span></span>
                                        <span>Created: ${this.app.formatDate(t.createdAt)}</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;

        this.bindEvents(platforms);
    }

    bindEvents(platforms) {
        document.querySelectorAll('#task-status-tabs .tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.filterStatus = tab.getAttribute('data-status');
                this.app.navigateTo('tasks');
            });
        });

        document.getElementById('task-create')?.addEventListener('click', () => this.showCreateModal(platforms));
        document.getElementById('task-create-empty')?.addEventListener('click', () => this.showCreateModal(platforms));

        document.getElementById('task-clear-done')?.addEventListener('click', async () => {
            const tasks = await ipcRenderer.invoke('get-tasks');
            const completed = tasks.filter(t => t.status === 'completed' || t.status === 'failed');
            for (const t of completed) {
                await ipcRenderer.invoke('delete-task', t.id);
            }
            this.app.toast('success', 'Cleared', `${completed.length} completed tasks removed.`);
            this.app.navigateTo('tasks');
        });

        document.querySelectorAll('.task-start').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                await ipcRenderer.invoke('start-task', id);
                this.app.toast('info', 'Task Started', 'Task is now running.');
                this.app.navigateTo('tasks');
            });
        });

        document.querySelectorAll('.task-stop').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                await ipcRenderer.invoke('stop-task', id);
                this.app.toast('warning', 'Task Stopped', 'Task has been stopped.');
                this.app.navigateTo('tasks');
            });
        });

        document.querySelectorAll('.task-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                await ipcRenderer.invoke('delete-task', id);
                this.app.toast('success', 'Task Deleted', 'Task has been removed.');
                this.app.navigateTo('tasks');
            });
        });
    }

    showCreateModal(platforms) {
        const actionsByPlatform = {};
        platforms.forEach(p => { actionsByPlatform[p.id] = p.actions; });

        const body = `
            <div class="input-group">
                <label class="input-label">Platform</label>
                <select class="input-field" id="new-task-platform">
                    ${platforms.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                </select>
            </div>
            <div class="input-group">
                <label class="input-label">Action</label>
                <select class="input-field" id="new-task-action">
                    ${(actionsByPlatform[platforms[0]?.id] || []).map(a => `<option value="${a}">${a.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>`).join('')}
                </select>
            </div>
            <div class="input-group">
                <label class="input-label">Target URL or Username</label>
                <input class="input-field" id="new-task-target" placeholder="https://instagram.com/username or @username">
            </div>
            <div class="input-row">
                <div class="input-group">
                    <label class="input-label">Count</label>
                    <input class="input-field" id="new-task-count" type="number" value="100" min="1">
                </div>
                <div class="input-group">
                    <label class="input-label">Delay (ms between actions)</label>
                    <input class="input-field" id="new-task-delay" type="number" value="3000" min="500">
                </div>
            </div>
            <div class="switch-group">
                <div class="switch-label">
                    <span class="switch-label-text">Use Proxies</span>
                    <span class="switch-label-desc">Route each action through a different proxy</span>
                </div>
                <label class="switch">
                    <input type="checkbox" id="new-task-proxy" checked>
                    <span class="switch-slider"></span>
                </label>
            </div>
            <div class="switch-group">
                <div class="switch-label">
                    <span class="switch-label-text">Headless Browser</span>
                    <span class="switch-label-desc">Run browsers without visible window</span>
                </div>
                <label class="switch">
                    <input type="checkbox" id="new-task-headless" checked>
                    <span class="switch-slider"></span>
                </label>
            </div>
        `;
        const footer = `
            <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="save-new-task">Create Task</button>
        `;
        this.app.openModal('Create New Task', body, footer);

        const platformSelect = document.getElementById('new-task-platform');
        const actionSelect = document.getElementById('new-task-action');
        platformSelect.addEventListener('change', () => {
            const actions = actionsByPlatform[platformSelect.value] || [];
            actionSelect.innerHTML = actions.map(a => `<option value="${a}">${a.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>`).join('');
        });

        document.getElementById('save-new-task').addEventListener('click', async () => {
            const task = {
                platform: document.getElementById('new-task-platform').value,
                action: document.getElementById('new-task-action').value,
                type: document.getElementById('new-task-action').value,
                targetUrl: document.getElementById('new-task-target').value,
                target: document.getElementById('new-task-target').value,
                count: parseInt(document.getElementById('new-task-count').value) || 100,
                delay: parseInt(document.getElementById('new-task-delay').value) || 3000,
                useProxy: document.getElementById('new-task-proxy').checked,
                headless: document.getElementById('new-task-headless').checked
            };
            await ipcRenderer.invoke('create-task', task);
            this.app.closeModal();
            this.app.toast('success', 'Task Created', `${task.action} task for ${task.platform} created.`);
            this.app.navigateTo('tasks');
        });
    }

    onTaskProgress(update) {
        const container = document.getElementById('page-container');
        if (container && this.app.currentPage === 'tasks') {
            this.render(container);
        }
    }

    getStatusBadge(status) {
        const map = { pending: 'badge-warning', running: 'badge-info', completed: 'badge-success', failed: 'badge-danger', stopped: 'badge-purple' };
        return map[status] || 'badge-info';
    }
}
