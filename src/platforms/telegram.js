const browserManager = require('../core/browser');
const fs = require('fs');
const path = require('path');

// ============================================================
// TELEGRAM PLATFORM MODULE
// Supports: create-account, join-channel, join-group, send-message, view-post
// Telegram Web has 3 versions (A, K, Z) — we try all as fallbacks
// ============================================================

async function executeAction(action, account, task, proxy, paths) {
    const { browser, context } = await browserManager.launchBrowser(proxy, task.headless);
    
    try {
        const page = await context.newPage();

        if (action === 'create-account') {
            return await handleCreateAccount(page, task, paths, account, proxy);
        }

        const loggedIn = await login(page, account, paths);
        if (!loggedIn) {
            return { success: false, error: 'Telegram web authorization failed — QR/phone login required' };
        }

        switch (action) {
            case 'join-channel': return await handleJoin(page, task.targetUrl || task.target);
            case 'join-group': return await handleJoin(page, task.targetUrl || task.target);
            case 'send-message': return await handleSendMessage(page, task.targetUrl || task.target, task.content || 'Hello!');
            case 'view-post': return await handleViewPost(page, task.targetUrl);
            default: return { success: false, error: `Action '${action}' not supported on Telegram.` };
        }
    } catch (e) {
        return { success: false, error: `Critical Telegram error: ${e.message}` };
    } finally {
        await browser.close();
    }
}

// ============================================================
// LOGIN — Try all 3 Telegram Web versions with saved cookies
// ============================================================
async function login(page, account, paths) {
    try {
        const sessionPath = path.join(paths.SESSIONS_PATH, `tg_${account.id}.json`);
        
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            
            // Try each Telegram Web version until one works
            const tgDomains = [
                'https://web.telegram.org/a/',
                'https://web.telegram.org/k/',
                'https://web.telegram.org/z/'
            ];
            
            for (const domain of tgDomains) {
                try {
                    await page.goto(domain, { waitUntil: 'load', timeout: 15000 });
                    await page.waitForTimeout(3000 + Math.random() * 2000);
                    
                    // Check for logged-in indicators (search bar, chat list, settings icon)
                    const loggedInIndicators = [
                        'input[placeholder*="Search"], input#telegram-search-input',
                        'input.input-field-input',
                        '.chatlist-container, .chat-list',
                        '.ListItem, .Chat',
                        '#LeftColumn, .LeftColumn',
                        'button[aria-label*="menu" i], button[aria-label*="Settings" i]'
                    ];
                    
                    for (const indicator of loggedInIndicators) {
                        if (await page.locator(indicator).count() > 0) {
                            return true;
                        }
                    }
                } catch (e) {
                    continue; // Try next version
                }
            }
        }
        
        return false;
    } catch (e) {
        return false;
    }
}

// ============================================================
// JOIN — Join a channel or group via deep link
// ============================================================
async function handleJoin(page, target) {
    try {
        const targetClean = target.replace('https://t.me/', '').replace('@', '');
        
        // Strategy 1: Use Telegram Web A deep link resolution
        await page.goto(`https://web.telegram.org/a/#?tgaddr=tg%3A%2F%2Fresolve%3Fdomain%3D${targetClean}`, { waitUntil: 'load' });
        await page.waitForTimeout(4000 + Math.random() * 2000);
        
        // Look for join button — class-based selectors (stable)
        const joinBtnSelectors = [
            'button.btn-primary',
            'button.SubscribedButton',
            'div.ChatInfo button.Button',
            '.chat-utils-join button',
            'button.ChatExtra-button'
        ];
        
        for (const selector of joinBtnSelectors) {
            const btn = await page.locator(selector);
            if (await btn.count() > 0) {
                const btnText = await btn.first().innerText();
                // Only click if it's actually a join/subscribe action
                if (btnText.toLowerCase().includes('join') || btnText.toLowerCase().includes('subscribe') || 
                    btnText.toLowerCase().includes('вступить') || btnText.toLowerCase().includes("qo'shilish") ||
                    btnText.toLowerCase().includes('подписаться')) {
                    await btn.first().click();
                    await page.waitForTimeout(2000);
                    return { success: true };
                }
            }
        }
        
        // Check if already joined (look for mute/unmute or leave indicators)
        const alreadyJoinedIndicators = [
            'button.btn-transparent:has(i.icon-mute)',
            'i.icon-mute',
            'button.chat-utils-mute',
            'button:has-text("Mute")',
            'button:has-text("Leave")',
            'button:has-text("LEAVE")'
        ];
        
        for (const indicator of alreadyJoinedIndicators) {
            if (await page.locator(indicator).count() > 0) {
                return { success: true, message: 'Already joined this channel/group' };
            }
        }
        
        // Strategy 2: Fallback — try via the t.me preview page
        await page.goto(`https://t.me/${targetClean}`, { waitUntil: 'load' });
        await page.waitForTimeout(2000);
        
        const previewJoinBtn = await page.locator('.tgme_action_button_new, a.tgme_action_button');
        if (await previewJoinBtn.count() > 0) {
            return { success: true, message: 'Channel preview page loaded — join requires in-app confirmation' };
        }
        
        return { success: false, error: 'Join element not found — channel may be private or invite-only' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// SEND MESSAGE — Type and send a message in a Telegram chat
// ============================================================
async function handleSendMessage(page, target, content) {
    try {
        const targetClean = target.replace('https://t.me/', '').replace('@', '');
        await page.goto(`https://web.telegram.org/a/#?tgaddr=tg%3A%2F%2Fresolve%3Fdomain%3D${targetClean}`, { waitUntil: 'load' });
        
        await page.waitForTimeout(4000 + Math.random() * 2000);
        
        // Try multiple input field selectors across Telegram Web versions
        const inputSelectors = [
            '#message-input-text',
            '.composer-input-field',
            'div[contenteditable="true"]',
            'div.input-message-input',
            'div[class*="composer"] div[contenteditable]'
        ];
        
        let inputFound = false;
        for (const selector of inputSelectors) {
            const input = await page.locator(selector);
            if (await input.count() > 0) {
                await input.first().click();
                await page.waitForTimeout(500);
                
                // Type with human-like speed
                await page.keyboard.type(content, { delay: 30 + Math.random() * 50 });
                await page.waitForTimeout(500 + Math.random() * 500);
                
                inputFound = true;
                break;
            }
        }
        
        if (!inputFound) {
            return { success: false, error: 'Message input field not found — may be read-only or restricted' };
        }
        
        // Click send button or press Enter
        const sendBtnSelectors = [
            'button.send-button',
            'button[title*="Send"]',
            'button.main-button',
            'button.Button.send',
            'button[class*="send"]'
        ];
        
        let sent = false;
        for (const selector of sendBtnSelectors) {
            const sendBtn = await page.locator(selector);
            if (await sendBtn.count() > 0) {
                await sendBtn.first().click();
                sent = true;
                break;
            }
        }
        
        if (!sent) {
            await page.keyboard.press('Enter');
        }

        await page.waitForTimeout(2000);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// VIEW POST — Open and scroll through a Telegram post
// ============================================================
async function handleViewPost(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(3000 + Math.random() * 1000);
        
        // Simulate reading — scroll slowly
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => window.scrollBy(0, 300 + Math.random() * 200));
            await page.waitForTimeout(1500 + Math.random() * 1500);
        }
        
        // Click to expand any "show more" buttons if present
        const showMore = await page.locator('.tgme_widget_message_text_wrap_more, button:has-text("Show more")');
        if (await showMore.count() > 0) {
            await showMore.first().click();
            await page.waitForTimeout(1000);
        }
        
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// CREATE ACCOUNT — Telegram uses phone-only signup
// This module navigates to the web login and fills the phone number
// SMS verification is handled by the SMS Service module
// ============================================================
async function handleCreateAccount(page, task, paths, accountTemplate, proxy) {
    try {
        let success = false;
        let pAcc = null;

        const smsService = require('../core/sms-service');
        const rentResp = await smsService.getNumber('tg', '0'); // tg = Telegram
        
        if (!rentResp.success) {
            return { success: false, error: 'SMS API Failed to rent number: ' + rentResp.error };
        }
        
        let phoneNumber = rentResp.number;
        if (phoneNumber.startsWith('+')) phoneNumber = phoneNumber.substring(1);
        
        const { generateIdentity } = require('../core/identity');
        const identity = generateIdentity();

        let cursor;
        try {
            const { createCursor } = require('ghost-cursor');
            cursor = createCursor(page);
        } catch(e) {}
        
        async function smartClick(selector) {
            if (cursor) {
                try { await cursor.click(selector); return; } catch(e) {}
            }
            const el = await page.locator(selector);
            if (await el.count() > 0) await el.first().click();
        }

        const methods = [
            async () => {
                await page.goto('https://web.telegram.org/k/', { waitUntil: 'load' });
                await page.waitForTimeout(3000 + Math.random() * 2000);
                
                // Click "Log in by phone Number" if available
                const loginByPhone = await page.locator('button:has(i.icon-phone), button.btn-secondary');
                const count = await loginByPhone.count();
                for (let i = 0; i < count; i++) {
                    const text = await loginByPhone.nth(i).innerText();
                    if (text.toLowerCase().includes('phone') || text.toLowerCase().includes('telefon') || text.toLowerCase().includes('log in')) {
                        await smartClick('button:has(i.icon-phone), button.btn-secondary >> nth=' + i);
                        await page.waitForTimeout(2000);
                        break;
                    }
                }
                    
                const phoneInput = await page.locator('input[type="tel"], input.input-field-input');
                if (await phoneInput.count() > 0) {
                    await phoneInput.first().focus();
                    
                    // Use keyboard backspace to clear country code if needed
                    for(let i=0; i<5; i++) await page.keyboard.press('Backspace', { delay: 50 });
                    for(let i=0; i<5; i++) await page.keyboard.press('Delete', { delay: 50 });
                    
                    await page.waitForTimeout(500);
                    await page.keyboard.type('+' + phoneNumber, { delay: 60 + Math.random() * 50 });
                    await page.waitForTimeout(1000 + Math.random() * 500);
                    
                    // Submit
                    const nextBtn = await page.locator('button.btn-primary:has-text("Next"), button.btn-primary:has-text("Davom")');
                    if (await nextBtn.count() > 0) {
                        await smartClick('button.btn-primary:has-text("Next"), button.btn-primary:has-text("Davom")');
                    } else {
                        await page.keyboard.press('Enter');
                    }
                    
                    await page.waitForTimeout(5000);
                    
                    // Wait for SMS
                    let code = null;
                    for (let i = 0; i < 20; i++) {
                        await page.waitForTimeout(4000);
                        const chk = await smsService.checkSms(rentResp.id);
                        if (chk.status === 'RECEIVED' && chk.code) {
                            code = chk.code;
                            break;
                        }
                    }
                    
                    if (!code) {
                        await smsService.cancelNumber(rentResp.id);
                        return { error: 'SMS check timeout on Telegram' };
                    }
                    
                    // Type code
                    await page.keyboard.type(code, { delay: 100 + Math.random() * 50 });
                    await page.waitForTimeout(3000);
                    
                    // Might ask for First/Last name
                    const nameInput = await page.locator('input[name="first_name"]');
                    if (await nameInput.count() > 0) {
                        await nameInput.first().focus();
                        await page.keyboard.type(identity.firstName, { delay: 50 + Math.random() * 30 });
                        const lastNameInput = await page.locator('input[name="last_name"]');
                        if (await lastNameInput.count() > 0) {
                            await lastNameInput.first().focus();
                            await page.keyboard.type(identity.lastName, { delay: 50 + Math.random() * 30 });
                        }
                        
                        await page.keyboard.press('Enter');
                        await page.waitForTimeout(4000);
                    }
                    
                    return { phone: phoneNumber };
                }
                
                return null;
            }
        ];

        for (let i = 0; i < methods.length; i++) {
            try {
                const res = await methods[i]();
                if (res && res.phone) {
                    success = true;
                    pAcc = {
                        username: identity.username,
                        firstName: identity.firstName,
                        lastName: identity.lastName,
                        phone: res.phone,
                        platform: 'telegram',
                        createdAt: new Date().toISOString()
                    };
                    break;
                }
            } catch (err) {
                continue;
            }
        }

        if (success) {
            return { success: true, account: pAcc };
        }

        // Clean up unverified number
        await smsService.cancelNumber(rentResp.id);
        return { success: false, error: 'Telegram registration failed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = { executeAction };
