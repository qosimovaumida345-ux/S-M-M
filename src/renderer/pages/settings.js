class SettingsPage {
    constructor(app) {
        this.app = app;
    }

    async render(container) {
        const config = await ipcRenderer.invoke('get-config');
        const appPath = await ipcRenderer.invoke('get-app-path');

        container.innerHTML = `
            <div class="fade-in">
                <div class="page-header">
                    <div>
                        <h1 class="page-title">Settings</h1>
                        <p class="page-subtitle">Configure your SMM automation preferences</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-primary" id="settings-save">
                            <i class="fas fa-save"></i> Save Changes
                        </button>
                    </div>
                </div>

                <div class="card mb-24">
                    <div class="card-header"><span class="card-title">General</span></div>
                    <div class="card-body">
                        <div class="input-group">
                            <label class="input-label">Worker Name</label>
                            <input class="input-field" id="cfg-worker-name" value="${config.workerName || ''}">
                        </div>
                        <div class="switch-group">
                            <div class="switch-label">
                                <span class="switch-label-text">Start with System</span>
                                <span class="switch-label-desc">Launch SMM Service when Windows starts</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="cfg-start-system" ${config.startWithSystem ? 'checked' : ''}>
                                <span class="switch-slider"></span>
                            </label>
                        </div>
                        <div class="switch-group">
                            <div class="switch-label">
                                <span class="switch-label-text">Minimize to Tray</span>
                                <span class="switch-label-desc">Keep running in system tray when window is closed</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="cfg-minimize-tray" ${config.minimizeToTray ? 'checked' : ''}>
                                <span class="switch-slider"></span>
                            </label>
                        </div>
                        <div class="switch-group">
                            <div class="switch-label">
                                <span class="switch-label-text">Desktop Notifications</span>
                                <span class="switch-label-desc">Show system notifications for task events</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="cfg-notifications" ${config.notifications ? 'checked' : ''}>
                                <span class="switch-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="card mb-24">
                    <div class="card-header"><span class="card-title">Browser Automation</span></div>
                    <div class="card-body">
                        <div class="input-row">
                            <div class="input-group">
                                <label class="input-label">Max Concurrent Browsers</label>
                                <input class="input-field" id="cfg-max-browsers" type="number" value="${config.maxConcurrentBrowsers || 5}" min="1" max="50">
                            </div>
                            <div class="input-group">
                                <label class="input-label">Task Retry Count</label>
                                <input class="input-field" id="cfg-retry-count" type="number" value="${config.taskRetryCount || 3}" min="0" max="10">
                            </div>
                        </div>
                        <div class="switch-group">
                            <div class="switch-label">
                                <span class="switch-label-text">Default Headless Mode</span>
                                <span class="switch-label-desc">Run browsers without visible window by default</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="cfg-headless" ${config.defaultHeadless ? 'checked' : ''}>
                                <span class="switch-slider"></span>
                            </label>
                        </div>
                        <div class="switch-group">
                            <div class="switch-label">
                                <span class="switch-label-text">Browser Fingerprinting</span>
                                <span class="switch-label-desc">Randomize browser fingerprints for stealth</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="cfg-fingerprint" ${config.browserFingerprint ? 'checked' : ''}>
                                <span class="switch-slider"></span>
                            </label>
                        </div>
                        <div class="switch-group">
                            <div class="switch-label">
                                <span class="switch-label-text">Auto-start Tasks</span>
                                <span class="switch-label-desc">Automatically start tasks when they are created</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="cfg-autostart" ${config.autoStartTasks ? 'checked' : ''}>
                                <span class="switch-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="card mb-24">
                    <div class="card-header"><span class="card-title">Proxy Settings</span></div>
                    <div class="card-body">
                        <div class="input-group">
                            <label class="input-label">Proxy Timeout (ms)</label>
                            <input class="input-field" id="cfg-proxy-timeout" type="number" value="${config.proxyTimeout || 10000}" min="1000" max="60000">
                        </div>
                    </div>
                </div>

                <div class="card mb-24">
                    <div class="card-header"><span class="card-title">Captcha and SMS</span></div>
                    <div class="card-body">
                        <div class="switch-group">
                            <div class="switch-label">
                                <span class="switch-label-text">Captcha Solver</span>
                                <span class="switch-label-desc">Enable local AI captcha solving</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="cfg-captcha" ${config.captchaSolverEnabled ? 'checked' : ''}>
                                <span class="switch-slider"></span>
                            </label>
                        </div>
                        <div class="input-group mt-16">
                            <label class="input-label">SMS Timeout (ms)</label>
                            <input class="input-field" id="cfg-sms-timeout" type="number" value="${config.smsTimeout || 120000}" min="30000" max="600000">
                        </div>
                    </div>
                </div>

                <div class="card mb-24">
                    <div class="card-header"><span class="card-title">API Connections</span></div>
                    <div class="card-body">
                        <div class="input-group">
                            <label class="input-label">Groq API Key (AI Vision Captcha Solver)</label>
                            <input class="input-field" id="cfg-groq-key" type="password" value="${config.groqApiKey || config.envGroqApiKey || ''}" placeholder="gsk_..." autocomplete="off">
                            <div style="font-size: 12px; color: var(--text-muted); margin-top: 5px;">Used to automatically bypass hCaptcha, reCAPTCHA, and Arkose limits via LLaMA 3.2 Vision.</div>
                        </div>
                        <div class="input-group mt-16">
                            <label class="input-label">Backend Platform Server (optional)</label>
                            <input class="input-field" id="cfg-api-endpoint" value="${config.apiEndpoint || ''}" placeholder="https://your-server.onrender.com">
                        </div>
                    </div>
                </div>

                <div class="card mb-24">
                    <div class="card-header"><span class="card-title">Data</span></div>
                    <div class="card-body">
                        <div class="flex-between mb-16">
                            <div>
                                <div class="font-bold">Data Directory</div>
                                <div class="text-sm text-muted">${appPath}</div>
                            </div>
                            <button class="btn btn-secondary" id="settings-open-folder">
                                <i class="fas fa-folder-open"></i> Open Folder
                            </button>
                        </div>
                        <div class="divider"></div>
                        <div class="flex-between">
                            <div>
                                <div class="font-bold" style="color: var(--accent-red);">Danger Zone</div>
                                <div class="text-sm text-muted">Clear all logs and temporary data</div>
                            </div>
                            <button class="btn btn-danger btn-sm" id="settings-clear-logs">
                                <i class="fas fa-trash"></i> Clear Logs
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents(config, appPath);
    }

    bindEvents(config, appPath) {
        document.getElementById('settings-save')?.addEventListener('click', async () => {
            const btn = document.getElementById('settings-save');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            btn.disabled = true;

            const groqKeyInput = document.getElementById('cfg-groq-key').value.trim();
            if (groqKeyInput && groqKeyInput !== config.envGroqApiKey && groqKeyInput !== config.groqApiKey) {
                const res = await ipcRenderer.invoke('check-groq-key', groqKeyInput);
                if (res.valid) {
                    await ipcRenderer.invoke('set-groq-key', groqKeyInput);
                } else {
                    this.app.toast('error', 'Invalid Groq Key', 'The provided API key failed validation.');
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                    return;
                }
            }

            const newConfig = {
                workerName: document.getElementById('cfg-worker-name').value,
                startWithSystem: document.getElementById('cfg-start-system').checked,
                minimizeToTray: document.getElementById('cfg-minimize-tray').checked,
                notifications: document.getElementById('cfg-notifications').checked,
                maxConcurrentBrowsers: parseInt(document.getElementById('cfg-max-browsers').value),
                taskRetryCount: parseInt(document.getElementById('cfg-retry-count').value),
                defaultHeadless: document.getElementById('cfg-headless').checked,
                browserFingerprint: document.getElementById('cfg-fingerprint').checked,
                autoStartTasks: document.getElementById('cfg-autostart').checked,
                proxyTimeout: parseInt(document.getElementById('cfg-proxy-timeout').value),
                captchaSolverEnabled: document.getElementById('cfg-captcha').checked,
                smsTimeout: parseInt(document.getElementById('cfg-sms-timeout').value),
                apiEndpoint: document.getElementById('cfg-api-endpoint').value,
                groqApiKey: groqKeyInput || config.groqApiKey,
                envGroqApiKey: config.envGroqApiKey,
                theme: config.theme || 'dark',
                language: config.language || 'en',
                logLevel: config.logLevel || 'info'
            };
            await ipcRenderer.invoke('save-config', newConfig);
            this.app.config = newConfig;
            this.app.toast('success', 'Settings Saved', 'Your configuration has been updated.');
            
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        });

        document.getElementById('settings-open-folder')?.addEventListener('click', () => {
            ipcRenderer.invoke('open-folder', appPath);
        });

        document.getElementById('settings-clear-logs')?.addEventListener('click', async () => {
            await ipcRenderer.invoke('clear-logs');
            this.app.toast('success', 'Logs Cleared', 'All log files have been removed.');
        });
    }
}
