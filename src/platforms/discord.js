const browserManager = require('../core/browser');
const fs = require('fs');
const path = require('path');

// ============================================================
// DISCORD PLATFORM MODULE
// Supports: create-account, join-server, send-message
// Discord uses hCaptcha aggressively — session-based auth preferred
// ============================================================

async function executeAction(action, account, task, proxy, paths) {
    const { browser, context } = await browserManager.launchBrowser(proxy, task.headless);
    
    try {
        const page = await context.newPage();

        if (action === 'create-account') {
            return await handleCreateAccount(page, task, paths, proxy);
        }

        const loggedIn = await login(page, account, paths);
        if (!loggedIn) {
            return { success: false, error: 'Discord authorization failed — session invalid or hCaptcha triggered' };
        }

        switch (action) {
            case 'join-server': return await handleJoinServer(page, task.targetUrl);
            case 'send-message': return await handleSendMessage(page, task.targetUrl, task.content || 'Hello!');
            case 'react': return await handleReact(page, task.targetUrl, task.emoji || '👍');
            default: return { success: false, error: `Action '${action}' not supported on Discord.` };
        }
    } catch (e) {
        return { success: false, error: `Critical Discord error: ${e.message}` };
    } finally {
        await browser.close();
    }
}

// ============================================================
// LOGIN — Session cookie restore (Discord requires hCaptcha for raw login)
// ============================================================
async function login(page, account, paths) {
    try {
        const sessionPath = path.join(paths.SESSIONS_PATH, `dc_${account.id}.json`);
        
        // STEP 1: Try restoring session
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            await page.goto('https://discord.com/app', { waitUntil: 'load' });
            await page.waitForTimeout(4000 + Math.random() * 2000);
            
            // Check for main app load — multiple selectors for robustness
            const isApp = await page.locator('div[class*="sidebar_"], div[aria-label="Servers"], nav[aria-label="Servers sidebar"]').count();
            if (isApp > 0) return true;
            
            // Check for the channel sidebar
            const channelList = await page.locator('div[class*="content_"], div[class*="channels_"]').count();
            if (channelList > 0) return true;
        }

        // STEP 2: Attempt token-based login (if account has a token stored)
        if (account.token) {
            await page.goto('https://discord.com/login', { waitUntil: 'load' });
            await page.waitForTimeout(2000);
            
            // Inject token into localStorage
            await page.evaluate((token) => {
                window.localStorage.setItem('token', `"${token}"`);
                window.location.reload();
            }, account.token);
            
            await page.waitForTimeout(5000);
            
            const isLoggedIn = await page.locator('div[class*="sidebar_"], nav[aria-label="Servers sidebar"]').count();
            if (isLoggedIn > 0) return true;
        }

        // STEP 3: Credential-based login (will likely trigger hCaptcha)
        await page.goto('https://discord.com/login', { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1000);
        
        const emailInput = await page.locator('input[name="email"]');
        const passwordInput = await page.locator('input[name="password"]');
        
        if (await emailInput.count() > 0 && await passwordInput.count() > 0) {
            await emailInput.first().fill(account.email || account.username);
            await page.waitForTimeout(500 + Math.random() * 500);
            await passwordInput.first().fill(account.password);
            await page.waitForTimeout(500 + Math.random() * 500);
            
            const loginBtn = await page.locator('button[type="submit"]');
            if (await loginBtn.count() > 0) {
                await loginBtn.first().click();
                await page.waitForTimeout(5000 + Math.random() * 3000);
            }
        }

        // Check for captcha challenge
        let isCaptchaTriggered = await page.locator('iframe[src*="hcaptcha"], iframe[src*="captcha"]').count() > 0;
        if (isCaptchaTriggered) {
             const captchaSolver = require('../core/captcha-solver');
             const solveRes = await captchaSolver.solvePlaywrightVisual(page);
             if (!solveRes.success) {
                 return false; // Groq failed or max attempts
             }
        }

        // Verify login
        const finalCheck = await page.locator('div[class*="sidebar_"], nav[aria-label="Servers sidebar"]').count();
        if (finalCheck > 0) {
            const cookies = await page.context().cookies();
            try { fs.writeFileSync(sessionPath, JSON.stringify(cookies)); } catch (e) {}
            return true;
        }

        return false;
    } catch (e) {
        return false;
    }
}

// ============================================================
// JOIN SERVER — Accept an invite link
// ============================================================
async function handleJoinServer(page, inviteUrl) {
    try {
        // Ensure the invite URL is valid
        let cleanUrl = inviteUrl;
        if (!cleanUrl.includes('discord.') && !cleanUrl.includes('discord.gg')) {
            cleanUrl = `https://discord.gg/${inviteUrl}`;
        }
        
        await page.goto(cleanUrl, { waitUntil: 'load' });
        await page.waitForTimeout(3000 + Math.random() * 2000);
        
        // Strategy 1: In-app invite accept ("Accept Invite" / "Join" button)
        const joinBtnSelectors = [
            'button[class*="marginBottom8"]',
            'button:has-text("Accept Invite")',
            'button:has-text("Join")',
            'button:has-text("Принять приглашение")',
            'button:has-text("Qabul qilish")',
            'div[class*="invite"] button'
        ];
        
        for (const selector of joinBtnSelectors) {
            const btn = await page.locator(selector);
            if (await btn.count() > 0) {
                await btn.first().click();
                await page.waitForTimeout(3000);
                return { success: true };
            }
        }
        
        // Strategy 2: Check if redirected to the server directly (already joined)
        const currentUrl = page.url();
        if (currentUrl.includes('/channels/')) {
            return { success: true, message: 'Already in this server, redirected to channels' };
        }
        
        // Strategy 3: Check for "Continue to Discord" external redirect
        const continueBtn = await page.locator('button:has-text("Continue"), a:has-text("Continue to Discord")');
        if (await continueBtn.count() > 0) {
            await continueBtn.first().click();
            await page.waitForTimeout(3000);
            return { success: true, message: 'Redirected to Discord app' };
        }
        
        return { success: false, error: 'Join button not found — invite may be expired or private' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// SEND MESSAGE — Type a message into a Discord channel
// ============================================================
async function handleSendMessage(page, channelUrl, content) {
    try {
        await page.goto(channelUrl, { waitUntil: 'load' });
        await page.waitForTimeout(4000 + Math.random() * 2000);
        
        // Strategy 1: Main message textbox (aria-label based — language-agnostic)
        const inputSelectors = [
            'div[role="textbox"][data-slate-editor="true"]',
            'div[role="textbox"][aria-label*="Message"]',
            'div[role="textbox"][aria-label*="Сообщение"]',
            'div[role="textbox"][aria-label*="Xabar"]',
            'div[class*="textArea_"] div[contenteditable="true"]'
        ];
        
        let inputFound = false;
        for (const selector of inputSelectors) {
            const inputBox = await page.locator(selector);
            if (await inputBox.count() > 0) {
                await inputBox.first().click();
                await page.waitForTimeout(500);
                
                // Type character by character for human-like behaviour
                await page.keyboard.type(content, { delay: 30 + Math.random() * 40 });
                await page.waitForTimeout(500 + Math.random() * 500);
                await page.keyboard.press('Enter');
                await page.waitForTimeout(2000);
                
                inputFound = true;
                return { success: true };
            }
        }
        
        if (!inputFound) {
            return { success: false, error: 'Message input not found — channel may be read-only or access denied' };
        }
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// REACT — Add emotion reaction to a message (experimental)
// ============================================================
async function handleReact(page, targetUrl, emoji) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(4000);
        
        // Hover over the last message to reveal the reaction button
        const messages = await page.locator('div[class*="message_"]');
        if (await messages.count() > 0) {
            await messages.last().hover();
            await page.waitForTimeout(500);
            
            // Click the reaction emoji button
            const reactionBtn = await page.locator('div[class*="buttons_"] button:first-child, button[aria-label="Add Reaction"]');
            if (await reactionBtn.count() > 0) {
                await reactionBtn.first().click();
                await page.waitForTimeout(1000);
                
                // Type emoji name in the search or pick from defaults
                const emojiSearch = await page.locator('input[placeholder*="search" i], input[type="text"]');
                if (await emojiSearch.count() > 0) {
                    await emojiSearch.first().fill(emoji);
                    await page.waitForTimeout(500);
                    
                    // Click the first result
                    const emojiResult = await page.locator('button[class*="emojiItem_"]');
                    if (await emojiResult.count() > 0) {
                        await emojiResult.first().click();
                        await page.waitForTimeout(1000);
                        return { success: true };
                    }
                }
            }
        }
        
        return { success: false, error: 'Could not add reaction — messages may not be loaded' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// CREATE ACCOUNT — Discord signup (hCaptcha is the main blocker)
// ============================================================
async function handleCreateAccount(page, task, paths, proxy) {
    try {
        let success = false;
        let pAcc = null;

        const methods = [
            // METHOD 1: Standard Discord register page
            async () => {
                await page.goto('https://discord.com/register', { waitUntil: 'load' });
                await page.waitForTimeout(3000 + Math.random() * 2000);
                
                // Generate REAL temporary email
                const tempEmail = require('../core/temp-email');
                const { email, login, domain } = await tempEmail.generateEmail('dc');
                const displayName = `DCUser${Math.floor(Math.random() * 9999)}`;
                const username = `dcuser_${Math.random().toString(36).substring(2, 8)}`;
                const password = `DcPass!${Math.random().toString(36).substring(2, 10)}`;
                
                // Fill email
                const emailInput = await page.locator('input[name="email"]');
                if (await emailInput.count() > 0) {
                    await emailInput.first().fill(email);
                    await page.waitForTimeout(500 + Math.random() * 500);
                }
                
                // Fill display name
                const displayInput = await page.locator('input[name="global_name"]');
                if (await displayInput.count() > 0) {
                    await displayInput.first().fill(displayName);
                    await page.waitForTimeout(500 + Math.random() * 500);
                }
                
                // Fill username
                const usernameInput = await page.locator('input[name="username"]');
                if (await usernameInput.count() > 0) {
                    await usernameInput.first().fill(username);
                    await page.waitForTimeout(500 + Math.random() * 500);
                }
                
                // Fill password
                const passInput = await page.locator('input[name="password"]');
                if (await passInput.count() > 0) {
                    await passInput.first().fill(password);
                    await page.waitForTimeout(500 + Math.random() * 500);
                }
                
                // Date of birth
                const monthSelect = await page.locator('div[class*="inputMonth"] div[role="button"]');
                if (await monthSelect.count() > 0) {
                    await monthSelect.first().click();
                    await page.waitForTimeout(500);
                    const jan = await page.locator('div[role="option"]:first-child');
                    if (await jan.count() > 0) await jan.first().click();
                }
                
                const daySelect = await page.locator('div[class*="inputDay"] div[role="button"]');
                if (await daySelect.count() > 0) {
                    await daySelect.first().click();
                    await page.waitForTimeout(500);
                    const day = await page.locator('div[role="option"]:nth-child(15)');
                    if (await day.count() > 0) await day.first().click();
                }
                
                const yearSelect = await page.locator('div[class*="inputYear"] div[role="button"]');
                if (await yearSelect.count() > 0) {
                    await yearSelect.first().click();
                    await page.waitForTimeout(500);
                    const yearOptions = await page.locator('div[role="option"]');
                    const count = await yearOptions.count();
                    for (let i = 0; i < count; i++) {
                        const text = await yearOptions.nth(i).innerText();
                        if (text.trim() === '2000') {
                            await yearOptions.nth(i).click();
                            break;
                        }
                    }
                }
                
                // Accept TOS checkbox
                const tosCheckbox = await page.locator('input[type="checkbox"]');
                if (await tosCheckbox.count() > 0) {
                    await tosCheckbox.first().click();
                    await page.waitForTimeout(500);
                }
                
                // Submit
                const submitBtn = await page.locator('button[type="submit"]');
                if (await submitBtn.count() > 0) {
                    await submitBtn.first().click();
                    await page.waitForTimeout(5000);
                }
                
                // Check for captcha and Auto-Solve with Groq!
                let isCaptchaTriggered = await page.locator('iframe[src*="hcaptcha"]').count() > 0;
                if (isCaptchaTriggered) {
                    const captchaSolver = require('../core/captcha-solver');
                    const solveRes = await captchaSolver.solvePlaywrightVisual(page);
                    if (solveRes.success) {
                        isCaptchaTriggered = false;
                    }
                }
                
                // Auto-verify email if account created
                if (!isCaptchaTriggered) {
                    await tempEmail.autoVerifyEmail(login, domain, page, 60000);
                }
                
                return {
                    email,
                    username,
                    displayName,
                    password,
                    captchaTriggered: isCaptchaTriggered
                };
            }
        ];

        for (let i = 0; i < methods.length; i++) {
            try {
                const res = await methods[i]();
                if (res) {
                    success = true;
                    pAcc = {
                        email: res.email,
                        username: res.username,
                        displayName: res.displayName,
                        password: res.password,
                        platform: 'discord',
                        captchaTriggered: res.captchaTriggered || false,
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

        return { success: false, error: 'Discord account creation blocked by hCaptcha or security check' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = { executeAction };
