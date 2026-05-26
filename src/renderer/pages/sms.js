class SmsPage {
    constructor(app) {
        this.app = app;
        this.activeNumbers = [];
    }

    async render(container) {
        container.innerHTML = `
            <div class="fade-in">
                <div class="page-header">
                    <div>
                        <h1 class="page-title">SMS Service</h1>
                        <p class="page-subtitle">Free phone number verification using public SMS services</p>
                    </div>
                </div>

                <div class="grid-2 mb-24">
                    <div class="card">
                        <div class="card-header"><span class="card-title">Get Number</span></div>
                        <div class="card-body">
                            <div class="input-group">
                                <label class="input-label">Provider</label>
                                <select class="input-field" id="sms-provider">
                                    <option value="receive-smss">receive-smss.com</option>
                                    <option value="sms-online">sms-online.co</option>
                                    <option value="freephonenum">freephonenum.com</option>
                                    <option value="receive-sms-free">receive-sms-free.cc</option>
                                    <option value="temp-number">temp-number.com</option>
                                </select>
                            </div>
                            <div class="input-group">
                                <label class="input-label">Country</label>
                                <select class="input-field" id="sms-country">
                                    <option value="us">United States</option>
                                    <option value="uk">United Kingdom</option>
                                    <option value="ca">Canada</option>
                                    <option value="de">Germany</option>
                                    <option value="fr">France</option>
                                    <option value="ru">Russia</option>
                                    <option value="in">India</option>
                                    <option value="any">Any Available</option>
                                </select>
                            </div>
                            <button class="btn btn-primary w-full" id="sms-get-number">
                                <i class="fas fa-phone"></i> Get Free Number
                            </button>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header"><span class="card-title">Active Numbers</span></div>
                        <div class="card-body" id="sms-active-numbers">
                            ${this.activeNumbers.length === 0 ? `
                                <div class="empty-state" style="padding: 20px;">
                                    <div class="text-sm text-muted">No active numbers. Get one from the left panel.</div>
                                </div>
                            ` : this.activeNumbers.map(n => `
                                <div class="flex-between mb-8" style="padding: 8px; background: var(--bg-card); border-radius: var(--radius-md);">
                                    <div>
                                        <div class="font-bold">${n.number}</div>
                                        <div class="text-sm text-muted">${n.provider} - ${n.country}</div>
                                    </div>
                                    <button class="btn btn-sm btn-secondary sms-check" data-number="${n.number}" data-provider="${n.provider}">
                                        <i class="fas fa-envelope"></i> Check SMS
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header"><span class="card-title">Received Messages</span></div>
                    <div class="card-body" id="sms-messages">
                        <div class="empty-state" style="padding: 20px;">
                            <div class="text-sm text-muted">Messages will appear here when you check a number.</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('sms-get-number')?.addEventListener('click', async () => {
            const provider = document.getElementById('sms-provider').value;
            const country = document.getElementById('sms-country').value;
            this.app.toast('info', 'Fetching Number', 'Searching for available numbers...');
            const result = await ipcRenderer.invoke('get-sms-number', { provider, country });
            if (result.success) {
                this.activeNumbers.push({ number: result.number, provider, country, id: result.id });
                this.app.toast('success', 'Number Found', result.number);
                this.app.navigateTo('sms');
            } else {
                this.app.toast('error', 'Failed', result.error || 'No numbers available.');
            }
        });

        document.querySelectorAll('.sms-check').forEach(btn => {
            btn.addEventListener('click', async () => {
                const number = btn.getAttribute('data-number');
                const provider = btn.getAttribute('data-provider');
                const entry = this.activeNumbers.find(n => n.number === number && n.provider === provider);
                if (entry) {
                    const result = await ipcRenderer.invoke('check-sms', { provider, numberId: entry.id });
                    const msgContainer = document.getElementById('sms-messages');
                    if (result.success && result.messages && result.messages.length > 0) {
                        msgContainer.innerHTML = result.messages.map(m => `
                            <div style="padding: 10px; border-bottom: 1px solid var(--border-primary);">
                                <div class="flex-between">
                                    <span class="font-bold">${m.from || 'Unknown'}</span>
                                    <span class="text-sm text-muted">${m.time || ''}</span>
                                </div>
                                <div class="mt-8" style="color: var(--text-primary); word-break: break-all;">${m.text || m.body || ''}</div>
                            </div>
                        `).join('');
                    } else {
                        msgContainer.innerHTML = '<div class="text-sm text-muted" style="padding: 20px; text-align: center;">No messages yet. Wait and try again.</div>';
                    }
                }
            });
        });
    }
}
