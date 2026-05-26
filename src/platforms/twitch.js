const browserManager = require('../core/browser');
const fs = require('fs');
const path = require('path');

// ============================================================
// TWITCH PLATFORM MODULE
// Supports: create-account, follow, view
// Twitch uses data-a-target attributes — very stable for automation
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
            return { success: false, error: 'Twitch authorization failed' };
        }

        switch (action) {
            case 'follow': return await handleFollow(page, task.targetUrl || task.target);
            case 'view': return await handleView(page, task.targetUrl || task.target, task.duration);
            case 'chat': return await handleChat(page, task.targetUrl || task.target, task.content || 'PogChamp');
            default: return { success: false, error: `Action '${action}' not supported on Twitch.` };
        }
    } catch (e) {
        return { success: false, error: `Critical Twitch error: ${e.message}` };
    } finally {
        await browser.close();
    }
}

// ============================================================
// LOGIN — Session restore + credential-based login
// ============================================================
async function login(page, account, paths) {
    try {
        const sessionPath = path.join(paths.SESSIONS_PATH, `twc_${account.id}.json`);
        
        // STEP 1: Try restoring session
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            await page.goto('https://www.twitch.tv/', { waitUntil: 'load' });
            await page.waitForTimeout(3000 + Math.random() * 2000);
            
            const isApp = await page.locator('[data-a-target="user-menu-toggle"]').count();
            if (isApp > 0) return true;
        }

        // STEP 2: Credential-based login
        await page.goto('https://www.twitch.tv/login', { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1000);
        
        const usernameInput = await page.locator('#login-username, input[autocomplete="username"]');
        const passwordInput = await page.locator('#password-input, input[autocomplete="current-password"]');
        
        if (await usernameInput.count() > 0 && await passwordInput.count() > 0) {
            await usernameInput.first().fill(account.username || account.email);
            await page.waitForTimeout(500 + Math.random() * 500);
            await passwordInput.first().fill(account.password);
            await page.waitForTimeout(500 + Math.random() * 500);
            
            const loginBtn = await page.locator('[data-a-target="passport-login-button"], button[type="submit"]');
            if (await loginBtn.count() > 0) {
                await loginBtn.first().click();
                await page.waitForTimeout(5000 + Math.random() * 3000);
            }
        }
        
        // Check for 2FA
        const twoFaInput = await page.locator('input[data-a-target="tw-input"]').count();
        if (twoFaInput > 0) return false;
        
        // Verify
        const finalCheck = await page.locator('[data-a-target="user-menu-toggle"]').count();
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
// FOLLOW — Follow a Twitch streamer/channel
// ============================================================
async function handleFollow(page, targetUrl) {
    try {
        let cleanUrl = targetUrl;
        if (!cleanUrl.includes('twitch.tv/')) {
            cleanUrl = `https://www.twitch.tv/${targetUrl}`;
        }
        
        await page.goto(cleanUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 2000);
        
        // Strategy 1: data-a-target follow button
        const followBtn = await page.locator('[data-a-target="follow-button"]');
        if (await followBtn.count() > 0) {
            await followBtn.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }
        
        // Check if already following
        const unfollowBtn = await page.locator('[data-a-target="unfollow-button"]');
        if (await unfollowBtn.count() > 0) {
            return { success: true, message: 'Already following this channel' };
        }
        
        // Strategy 2: Generic follow button fallback
        const genericFollow = await page.locator('button[aria-label*="Follow" i], button:has(figure.tw-svg)');
        if (await genericFollow.count() > 0) {
            await genericFollow.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }
        
        return { success: false, error: 'Follow element not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// VIEW — Watch a Twitch stream for a specified duration
// ============================================================
async function handleView(page, targetUrl, duration) {
    try {
        let cleanUrl = targetUrl;
        if (!cleanUrl.includes('twitch.tv/')) {
            cleanUrl = `https://www.twitch.tv/${targetUrl}`;
        }
        
        await page.goto(cleanUrl, { waitUntil: 'load' });
        await page.waitForTimeout(3000 + Math.random() * 2000);
        
        const viewDuration = parseInt(duration) || 60000;
        
        // Dismiss any mature content warning
        const matureBtn = await page.locator('[data-a-target="player-overlay-mature-accept"], button:has-text("Start Watching")');
        if (await matureBtn.count() > 0) {
            await matureBtn.first().click();
            await page.waitForTimeout(1000);
        }
        
        // Make sure the player is playing
        const playBtn = await page.locator('[data-a-target="player-play-pause-button"]');
        if (await playBtn.count() > 0) {
            const state = await playBtn.first().getAttribute('data-a-player-state');
            if (state === 'paused') {
                await playBtn.first().click();
                await page.waitForTimeout(500);
            }
        }
        
        // Simulate human-like mouse movements during viewing
        const mouseInterval = setInterval(async () => {
            try {
                await page.mouse.move(
                    300 + Math.random() * 500,
                    200 + Math.random() * 300
                );
            } catch (e) {}
        }, 15000);

        await page.waitForTimeout(viewDuration);
        
        clearInterval(mouseInterval);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// CHAT — Send a chat message in a Twitch live stream
// ============================================================
async function handleChat(page, targetUrl, content) {
    try {
        let cleanUrl = targetUrl;
        if (!cleanUrl.includes('twitch.tv/')) {
            cleanUrl = `https://www.twitch.tv/${targetUrl}`;
        }
        
        await page.goto(cleanUrl, { waitUntil: 'load' });
        await page.waitForTimeout(4000 + Math.random() * 2000);
        
        // Find the chat input
        const chatInput = await page.locator('[data-a-target="chat-input"], div[data-a-target="chat-input"]');
        if (await chatInput.count() > 0) {
            await chatInput.first().click();
            await page.waitForTimeout(500);
            await page.keyboard.type(content, { delay: 30 + Math.random() * 50 });
            await page.waitForTimeout(500 + Math.random() * 500);
            
            // Click send or press Enter
            const sendBtn = await page.locator('[data-a-target="chat-send-button"]');
            if (await sendBtn.count() > 0) {
                await sendBtn.first().click();
            } else {
                await page.keyboard.press('Enter');
            }
            
            await page.waitForTimeout(2000);
            return { success: true };
        }
        
        return { success: false, error: 'Chat input not found — may be subscriber-only or stream is offline' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// CREATE ACCOUNT — Twitch signup process
// ============================================================
async function handleCreateAccount(page, task, paths, proxy) {
    try {
        let success = false;
        let pAcc = null;

        const methods = [
            // METHOD 1: Direct Twitch signup
            async () => {
                await page.goto('https://www.twitch.tv/', { waitUntil: 'load' });
                await page.waitForTimeout(3000 + Math.random() * 2000);
                
                // Click Sign Up button on the top bar
                const signupBtn = await page.locator('[data-a-target="signup-button"]');
                if (await signupBtn.count() > 0) {
                    await signupBtn.first().click();
                    await page.waitForTimeout(2000);
                }
                
                const username = `twc_${Math.random().toString(36).substring(2, 10)}`;
                const password = `TwcPass!${Math.random().toString(36).substring(2, 10)}`;
                const email = `${username}@example.com`;
                
                // Fill username
                const usernameInput = await page.locator('#signup-username, input[autocomplete="username"]');
                if (await usernameInput.count() > 0) {
                    await usernameInput.first().fill(username);
                    await page.waitForTimeout(500 + Math.random() * 500);
                }
                
                // Fill password
                const passInput = await page.locator('#signup-password, input[autocomplete="new-password"]');
                if (await passInput.count() > 0) {
                    await passInput.first().fill(password);
                    await page.waitForTimeout(500 + Math.random() * 500);
                }
                
                // Date of birth
                const monthSelect = await page.locator('[data-a-target="birthday-month-select"]');
                if (await monthSelect.count() > 0) {
                    await monthSelect.first().selectOption('1');
                    
                    const dayInput = await page.locator('[data-a-target="birthday-date-input"]');
                    if (await dayInput.count() > 0) await dayInput.first().fill('15');
                    
                    const yearInput = await page.locator('[data-a-target="birthday-year-input"]');
                    if (await yearInput.count() > 0) await yearInput.first().fill('1998');
                }
                
                // Fill email
                const emailInput = await page.locator('#signup-email, input[type="email"]');
                if (await emailInput.count() > 0) {
                    await emailInput.first().fill(email);
                    await page.waitForTimeout(500);
                }
                
                // Submit signup
                const submitBtn = await page.locator('[data-a-target="passport-signup-button"], button[type="submit"]');
                if (await submitBtn.count() > 0) {
                    await submitBtn.first().click();
                    await page.waitForTimeout(5000);
                }
                
                // Check for captcha
                const captcha = await page.locator('iframe[src*="arkose"], iframe[title*="Verification"]').count();
                
                return {
                    username,
                    email,
                    password,
                    captchaTriggered: captcha > 0
                };
            }
        ];

        for (let i = 0; i < methods.length; i++) {
            try {
                const res = await methods[i]();
                if (res) {
                    success = true;
                    pAcc = {
                        username: res.username,
                        email: res.email,
                        password: res.password,
                        platform: 'twitch',
                        captchaTriggered: res.captchaTriggered || false,
                        createdAt: new Date().toISOString()
                    };
                    break;
                }
            } catch (err) {
                continue;
            }
        }

        if (success) return { success: true, account: pAcc };
        return { success: false, error: 'Twitch account creation blocked — Arkose captcha or anti-bot' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = { executeAction };
