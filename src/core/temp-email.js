const axios = require('axios');

// ============================================================
// REAL TEMPORARY EMAIL ENGINE — 100% FREE
// 
// Provider 1: 1secmail — proven, fast, always works
// Provider 2: mail.tm — real domains, good acceptance
// Provider 3: guerrillamail — reliable backup
//
// Used for: Discord, Spotify, Roblox, Twitch, Facebook
// NOT for: YouTube/Google (requires phone), Instagram (requires phone)
// ============================================================

const SECMAIL_DOMAINS = ['1secmail.com', '1secmail.org', '1secmail.net'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Generate a real temporary email from 1secmail (FREE, no API key)
 */
async function generateEmail(prefix = 'smm') {
    // Method 1: Official API
    try {
        const res = await axios.get('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1', { timeout: 8000 });
        if (res.data && res.data.length > 0) {
            const email = res.data[0];
            const [login, domain] = email.split('@');
            return { email, login, domain, provider: '1secmail' };
        }
    } catch (e) {}

    // Method 2: Manual construction (always works)
    const domain = pick(SECMAIL_DOMAINS);
    const login = `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
    const email = `${login}@${domain}`;
    return { email, login, domain, provider: '1secmail' };
}

/**
 * Generate email from mail.tm (FREE, better acceptance on some forms)
 */
async function generateMailTm() {
    try {
        // Get available domains
        const domRes = await axios.get('https://api.mail.tm/domains', { timeout: 8000 });
        if (!domRes.data || !domRes.data['hydra:member'] || domRes.data['hydra:member'].length === 0) {
            return null;
        }
        const domain = domRes.data['hydra:member'][0].domain;
        const login = `smm${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`;
        const email = `${login}@${domain}`;
        const password = `Pass${Math.random().toString(36).substring(2, 12)}!1`;

        // Create account
        const createRes = await axios.post('https://api.mail.tm/accounts', {
            address: email,
            password: password
        }, { timeout: 10000 });

        if (createRes.data && createRes.data.id) {
            // Get auth token
            const tokenRes = await axios.post('https://api.mail.tm/token', {
                address: email,
                password: password
            }, { timeout: 8000 });

            return {
                email,
                login,
                domain,
                provider: 'mailtm',
                token: tokenRes.data.token,
                accountId: createRes.data.id,
                password
            };
        }
    } catch (e) {}
    return null;
}

/**
 * Poll 1secmail inbox for verification code/link
 */
async function waitForCode(login, domain, timeoutMs = 120000, intervalMs = 4000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        try {
            const res = await axios.get(
                `https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`,
                { timeout: 8000 }
            );

            if (res.data && res.data.length > 0) {
                const msgId = res.data[0].id;
                const msgRes = await axios.get(
                    `https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${msgId}`,
                    { timeout: 8000 }
                );

                const body = msgRes.data.textBody || '';
                const htmlBody = msgRes.data.htmlBody || '';
                const subject = msgRes.data.subject || '';
                const fullText = `${subject} ${body} ${htmlBody}`;

                // Extract code (4-8 digits, prefer longer)
                const codes = fullText.match(/\b(\d{4,8})\b/g);
                let code = null;
                if (codes && codes.length > 0) {
                    code = codes.sort((a, b) => b.length - a.length)[0];
                }

                // Extract verification link
                let link = null;
                const linkMatch = (htmlBody || body).match(/href=["'](https?:\/\/[^"'\s]*(?:verify|confirm|activate|valid|token|auth|email|click)[^"'\s]*)["']/i)
                    || (body).match(/(https?:\/\/\S*(?:verify|confirm|activate|valid|token|auth|email)\S*)/i);
                if (linkMatch) {
                    link = linkMatch[1].replace(/^href=["']/, '').replace(/["']$/, '');
                }

                return { found: true, code, link, subject, body: body || htmlBody };
            }
        } catch (e) {}

        await new Promise(r => setTimeout(r, intervalMs));
    }

    return { found: false, code: null, link: null, subject: '', body: '' };
}

/**
 * Poll mail.tm inbox for verification
 */
async function waitForCodeMailTm(token, timeoutMs = 120000, intervalMs = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        try {
            const res = await axios.get('https://api.mail.tm/messages', {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 8000
            });

            if (res.data && res.data['hydra:member'] && res.data['hydra:member'].length > 0) {
                const msg = res.data['hydra:member'][0];
                // Get full message
                const fullMsg = await axios.get(`https://api.mail.tm/messages/${msg.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                    timeout: 8000
                });

                const body = fullMsg.data.text || '';
                const htmlBody = fullMsg.data.html ? fullMsg.data.html.join(' ') : '';
                const subject = fullMsg.data.subject || '';
                const fullText = `${subject} ${body} ${htmlBody}`;

                const codes = fullText.match(/\b(\d{4,8})\b/g);
                let code = codes ? codes.sort((a, b) => b.length - a.length)[0] : null;

                let link = null;
                const linkMatch = (htmlBody || body).match(/href=["'](https?:\/\/[^"'\s]*(?:verify|confirm|activate|valid|token|auth)[^"'\s]*)["']/i);
                if (linkMatch) link = linkMatch[1];

                return { found: true, code, link, subject, body };
            }
        } catch (e) {}

        await new Promise(r => setTimeout(r, intervalMs));
    }

    return { found: false, code: null, link: null, subject: '', body: '' };
}

/**
 * Auto-fill verification code on page
 */
async function autoVerifyOnPage(code, link, page) {
    if (!page) return { verified: false };

    if (code) {
        const codeSelectors = [
            'input[name="code"]', 'input[name="verification_code"]', 'input[name="confirmationCode"]',
            'input[name="email_confirmation_code"]', 'input[name="verifyCode"]', 'input[name="otp"]',
            'input[aria-label*="code" i]', 'input[aria-label*="verif" i]', 'input[aria-label*="confirm" i]',
            'input[placeholder*="code" i]', 'input[placeholder*="verif" i]',
            'input[data-testid*="code" i]', 'input[data-testid*="verify" i]',
            'input[type="tel"][maxlength]', 'input[type="number"][maxlength]',
            'input.verification-code', 'input#code'
        ];

        for (const sel of codeSelectors) {
            try {
                const inp = await page.locator(sel);
                if (await inp.count() > 0 && await inp.first().isVisible().catch(() => false)) {
                    await inp.first().fill(code);
                    await page.waitForTimeout(800 + Math.random() * 500);

                    // Submit
                    const submitSels = [
                        'button[type="submit"]', 'button:has-text("Verify")', 'button:has-text("Confirm")',
                        'button:has-text("Next")', 'button:has-text("Continue")', 'button:has-text("Submit")'
                    ];
                    for (const btnSel of submitSels) {
                        const btn = await page.locator(btnSel);
                        if (await btn.count() > 0 && await btn.first().isVisible().catch(() => false)) {
                            await btn.first().click();
                            await page.waitForTimeout(3000);
                            break;
                        }
                    }
                    return { verified: true, code, link };
                }
            } catch (e) {}
        }
    }

    if (link) {
        try {
            await page.goto(link, { waitUntil: 'load', timeout: 15000 });
            await page.waitForTimeout(3000);
            return { verified: true, code, link };
        } catch (e) {}
    }

    return { verified: false, code, link };
}

module.exports = {
    generateEmail,
    generateMailTm,
    waitForCode,
    waitForCodeMailTm,
    autoVerifyOnPage,
    pick,
    SECMAIL_DOMAINS
};
