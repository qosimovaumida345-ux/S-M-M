class CaptchaPage {
    constructor(app) {
        this.app = app;
    }

    async render(container) {
        container.innerHTML = `
            <div class="fade-in">
                <div class="page-header">
                    <div>
                        <h1 class="page-title">Captcha Solver</h1>
                        <p class="page-subtitle">Local AI-powered captcha solving without paid APIs</p>
                    </div>
                </div>

                <div class="stat-grid mb-24">
                    <div class="stat-card green">
                        <div class="stat-card-header">
                            <div class="stat-card-icon"><i class="fas fa-check"></i></div>
                        </div>
                        <div class="stat-card-value" id="cap-solved">0</div>
                        <div class="stat-card-label">Solved</div>
                    </div>
                    <div class="stat-card red">
                        <div class="stat-card-header">
                            <div class="stat-card-icon"><i class="fas fa-times"></i></div>
                        </div>
                        <div class="stat-card-value" id="cap-failed">0</div>
                        <div class="stat-card-label">Failed</div>
                    </div>
                    <div class="stat-card blue">
                        <div class="stat-card-header">
                            <div class="stat-card-icon"><i class="fas fa-tachometer-alt"></i></div>
                        </div>
                        <div class="stat-card-value" id="cap-avg-time">0s</div>
                        <div class="stat-card-label">Avg Solve Time</div>
                    </div>
                </div>

                <div class="grid-2 mb-24">
                    <div class="card">
                        <div class="card-header"><span class="card-title">Supported Types</span></div>
                        <div class="card-body">
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                <div class="flex-between" style="padding: 10px; background: var(--bg-card); border-radius: var(--radius-md);">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <span class="badge badge-success">Active</span>
                                        <span class="font-bold">hCaptcha</span>
                                    </div>
                                    <span class="text-sm text-muted">Image Classification</span>
                                </div>
                                <div class="flex-between" style="padding: 10px; background: var(--bg-card); border-radius: var(--radius-md);">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <span class="badge badge-success">Active</span>
                                        <span class="font-bold">reCAPTCHA v2</span>
                                    </div>
                                    <span class="text-sm text-muted">Audio Transcription</span>
                                </div>
                                <div class="flex-between" style="padding: 10px; background: var(--bg-card); border-radius: var(--radius-md);">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <span class="badge badge-success">Active</span>
                                        <span class="font-bold">Text Captcha</span>
                                    </div>
                                    <span class="text-sm text-muted">Tesseract OCR</span>
                                </div>
                                <div class="flex-between" style="padding: 10px; background: var(--bg-card); border-radius: var(--radius-md);">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <span class="badge badge-warning">Beta</span>
                                        <span class="font-bold">reCAPTCHA v3</span>
                                    </div>
                                    <span class="text-sm text-muted">Score Bypass</span>
                                </div>
                                <div class="flex-between" style="padding: 10px; background: var(--bg-card); border-radius: var(--radius-md);">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <span class="badge badge-warning">Beta</span>
                                        <span class="font-bold">Cloudflare Turnstile</span>
                                    </div>
                                    <span class="text-sm text-muted">Browser Challenge</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header"><span class="card-title">Manual Test</span></div>
                        <div class="card-body">
                            <div class="input-group">
                                <label class="input-label">Captcha Type</label>
                                <select class="input-field" id="cap-test-type">
                                    <option value="hcaptcha">hCaptcha</option>
                                    <option value="recaptcha-v2">reCAPTCHA v2</option>
                                    <option value="text">Text Captcha</option>
                                </select>
                            </div>
                            <div class="input-group">
                                <label class="input-label">Site Key</label>
                                <input class="input-field" id="cap-test-sitekey" placeholder="Site key from target page">
                            </div>
                            <div class="input-group">
                                <label class="input-label">Page URL</label>
                                <input class="input-field" id="cap-test-url" placeholder="https://target-site.com/page">
                            </div>
                            <button class="btn btn-primary w-full" id="cap-test-solve">
                                <i class="fas fa-puzzle-piece"></i> Test Solve
                            </button>
                            <div id="cap-test-result" class="mt-16"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('cap-test-solve')?.addEventListener('click', async () => {
            const type = document.getElementById('cap-test-type').value;
            const siteKey = document.getElementById('cap-test-sitekey').value;
            const pageUrl = document.getElementById('cap-test-url').value;
            const resultDiv = document.getElementById('cap-test-result');
            resultDiv.innerHTML = '<div class="loading-overlay" style="padding: 10px;"><div class="loading-spinner"></div><span>Solving...</span></div>';
            const result = await ipcRenderer.invoke('solve-captcha', { type, siteKey, pageUrl });
            if (result.success) {
                resultDiv.innerHTML = `<div class="badge badge-success" style="padding: 8px 12px; word-break: break-all;">Token: ${result.token?.substring(0, 60)}...</div>`;
                this.app.toast('success', 'Captcha Solved', `Solved in ${result.time || '?'}ms`);
            } else {
                resultDiv.innerHTML = `<div class="badge badge-danger" style="padding: 8px 12px;">Failed: ${result.error}</div>`;
                this.app.toast('error', 'Solve Failed', result.error);
            }
        });
    }
}
