const axios = require('axios');

// ============================================================
// REAL TEMPORARY EMAIL ENGINE
// Generates actual working email inboxes from 1secmail/guerrillamail
// Auto-polls for verification codes and links
// Auto-fills verification forms on the page
// ============================================================

const SECMAIL_DOMAINS = ['1secmail.com', '1secmail.org', '1secmail.net'];

const { generateIdentity } = require('./identity');

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Generate a real temporary email address from 1secmail
 * @param {string} prefix - prefix for the email (e.g. 'dc', 'sp', 'ig')
 * @returns {{ email: string, login: string, domain: string }}
 */
async function generateEmail(prefix = 'smm') {
    // Method 1: Try official API
    try {
        const res = await axios.get('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1', { timeout: 8000 });
        if (res.data && res.data.length > 0) {
            const email = res.data[0];
            const [login, domain] = email.split('@');
            return { email, login, domain };
        }
    } catch (e) {}

    // Method 2: Manual construction with random login (always works)
    const domain = pick(SECMAIL_DOMAINS);
    const login = `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
    const email = `${login}@${domain}`;
    return { email, login, domain };
}

/**
 * Poll inbox for new messages and extract verification code/link
 * @param {string} login - mailbox login
 * @param {string} domain - mailbox domain
 * @param {number} timeoutMs - total time to wait (default 90s)
 * @param {number} intervalMs - poll interval (default 4s)
 * @returns {{ found: boolean, code: string|null, link: string|null, subject: string, body: string }}
 */
async function waitForVerificationCode(login, domain, timeoutMs = 90000, intervalMs = 4000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        try {
            const res = await axios.get(
                `https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`,
                { timeout: 8000 }
            );

            if (res.data && res.data.length > 0) {
                // Read the latest message
                const msgId = res.data[0].id;
                const msgRes = await axios.get(
                    `https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${msgId}`,
                    { timeout: 8000 }
                );

                const body = msgRes.data.textBody || '';
                const htmlBody = msgRes.data.htmlBody || '';
                const subject = msgRes.data.subject || '';
                const fullText = `${subject} ${body} ${htmlBody}`;

                // Extract verification code (4-8 digits, prioritize longer codes)
                const codes = fullText.match(/\b(\d{4,8})\b/g);
                let code = null;
                if (codes && codes.length > 0) {
                    // Pick the longest code (more likely to be verification)
                    code = codes.sort((a, b) => b.length - a.length)[0];
                }

                // Extract verification link
                const linkPatterns = [
                    /href=["'](https?:\/\/[^"'\s]*(?:verify|confirm|activate|valid|token|code|auth|email|click)[^"'\s]*)["']/gi,
                    /(https?:\/\/\S*(?:verify|confirm|activate|valid|token|code|auth|email)\S*)/gi
                ];
                let link = null;
                for (const pat of linkPatterns) {
                    const m = (htmlBody || body).match(pat);
                    if (m && m.length > 0) {
                        // Clean href="" wrapper if present
                        link = m[0].replace(/^href=["']/, '').replace(/["']$/, '');
                        break;
                    }
                }

                return { found: true, code, link, subject, body: body || htmlBody };
            }
        } catch (e) {
            // API timeout/error — retry
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    return { found: false, code: null, link: null, subject: '', body: '' };
}

/**
 * Auto-verify: Find code input on page, fill it, and submit
 * @param {string} login - temp email login
 * @param {string} domain - temp email domain
 * @param {object} page - Playwright page object
 * @param {number} timeoutMs - max wait time
 * @returns {{ verified: boolean, code: string|null, link: string|null }}
 */
async function autoVerifyEmail(login, domain, page, timeoutMs = 60000) {
    const result = await waitForVerificationCode(login, domain, timeoutMs, 4000);

    if (!result.found) {
        return { verified: false, code: null, link: null };
    }

    // Try auto-filling code on page
    if (result.code) {
        try {
            const codeSelectors = [
                'input[name="code"]', 'input[name="verification_code"]', 'input[name="confirmationCode"]',
                'input[name="email_confirmation_code"]', 'input[name="verifyCode"]', 'input[name="otp"]',
                'input[aria-label*="code" i]', 'input[aria-label*="verif" i]', 'input[aria-label*="confirm" i]',
                'input[placeholder*="code" i]', 'input[placeholder*="verif" i]',
                'input[data-testid*="code" i]', 'input[data-testid*="verify" i]',
                'input[type="tel"][maxlength]', 'input[type="number"][maxlength]',
                'input.verification-code', 'input#code'
            ];

            for (const selector of codeSelectors) {
                const input = await page.locator(selector);
                if (await input.count() > 0 && await input.first().isVisible().catch(() => false)) {
                    await input.first().fill(result.code);
                    await page.waitForTimeout(800 + Math.random() * 500);

                    // Try submitting
                    const submitSelectors = [
                        'button[type="submit"]', 'button:has-text("Verify")', 'button:has-text("Confirm")',
                        'button:has-text("Next")', 'button:has-text("Continue")', 'button:has-text("Submit")',
                        'div[role="button"]:has-text("Next")', 'div[role="button"]:has-text("Verify")'
                    ];
                    for (const btnSel of submitSelectors) {
                        const btn = await page.locator(btnSel);
                        if (await btn.count() > 0 && await btn.first().isVisible().catch(() => false)) {
                            await btn.first().click();
                            await page.waitForTimeout(3000);
                            break;
                        }
                    }
                    return { verified: true, code: result.code, link: result.link };
                }
            }
        } catch (e) {}
    }

    // If we have a verification link, navigate to it
    if (result.link) {
        try {
            await page.goto(result.link, { waitUntil: 'load', timeout: 15000 });
            await page.waitForTimeout(3000);
            return { verified: true, code: result.code, link: result.link };
        } catch (e) {}
    }

    return { verified: false, code: result.code, link: result.link };
}

module.exports = {
    generateEmail,
    generateIdentity,
    waitForVerificationCode,
    autoVerifyEmail,
    pick
};
