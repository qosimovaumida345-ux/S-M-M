const browserManager = require('../core/browser');
const fs = require('fs');
const path = require('path');

// ============================================================
// TIKTOK PLATFORM MODULE
// Supports: create-account, follow, like, comment, view
// TikTok uses data-e2e attributes for testing — good for automation
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
            return { success: false, error: 'TikTok authorization failed — session cookies required' };
        }

        switch (action) {
            case 'follow': return await handleFollow(page, task.target || task.targetUrl);
            case 'like': return await handleLike(page, task.targetUrl);
            case 'comment': return await handleComment(page, task.targetUrl, task.content || '🔥');
            case 'view': return await handleView(page, task.targetUrl, task.duration);
            default: return { success: false, error: `Action '${action}' not supported on TikTok.` };
        }
    } catch (e) {
        return { success: false, error: `Critical TikTok error: ${e.message}` };
    } finally {
        await browser.close();
    }
}

// ============================================================
// LOGIN — Cookie-based session restore (TikTok login is heavily captcha'd)
// ============================================================
async function login(page, account, paths) {
    try {
        const sessionPath = path.join(paths.SESSIONS_PATH, `tt_${account.id}.json`);
        
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            await page.goto('https://www.tiktok.com/', { waitUntil: 'load' });
            await page.waitForTimeout(3000 + Math.random() * 2000);
            
            // Check for logged-in state via multiple indicators
            const loggedInIndicators = [
                '[data-e2e="profile-icon"]',
                '.tiktok-avatar',
                'a[href*="/profile"]',
                'div[data-e2e="nav-user"]',
                'button[data-e2e="user-menu"]'
            ];
            
            for (const indicator of loggedInIndicators) {
                if (await page.locator(indicator).count() > 0) return true;
            }
        }

        // Fallback: Try credential-based login (usually triggers captcha)
        await page.goto('https://www.tiktok.com/login/phone-or-email/email', { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1000);
        
        const emailInput = await page.locator('input[name="username"], input[placeholder*="email" i], input[placeholder*="phone" i]');
        const passInput = await page.locator('input[type="password"]');
        
        if (await emailInput.count() > 0 && await passInput.count() > 0) {
            await emailInput.first().fill(account.email || account.username);
            await page.waitForTimeout(500 + Math.random() * 500);
            await passInput.first().fill(account.password);
            await page.waitForTimeout(500 + Math.random() * 500);
            
            const loginBtn = await page.locator('button[data-e2e="login-button"], button[type="submit"]');
            if (await loginBtn.count() > 0) {
                await loginBtn.first().click();
                await page.waitForTimeout(5000);
            }
        }
        
        // Check for captcha
        const captchaFrame = await page.locator('div[id*="captcha"], iframe[src*="captcha"]').count();
        if (captchaFrame > 0) return false;
        
        // Verify
        const finalCheck = await page.locator('[data-e2e="profile-icon"], .tiktok-avatar').count();
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
// FOLLOW — Follow a TikTok user
// ============================================================
async function handleFollow(page, targetUrl) {
    try {
        let cleanUrl = targetUrl;
        if (!cleanUrl.includes('tiktok.com')) {
            cleanUrl = `https://www.tiktok.com/@${targetUrl.replace('@', '')}`;
        }
        
        await page.goto(cleanUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 2000);
        
        // Strategy 1: data-e2e follow button (most reliable)
        const followBtn = await page.locator('[data-e2e="follow-button"]');
        if (await followBtn.count() > 0) {
            const text = await followBtn.first().innerText();
            if (text.toLowerCase().includes('follow') && !text.toLowerCase().includes('following')) {
                await followBtn.first().click();
                await page.waitForTimeout(2000);
                return { success: true };
            } else {
                return { success: true, message: 'Already following this user' };
            }
        }
        
        // Strategy 2: Class-based selector fallback
        const followBtnAlt = await page.locator('button[class*="follow-button"], button.tiktok-follow-button');
        if (await followBtnAlt.count() > 0) {
            await followBtnAlt.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }
        
        // Check for message/DM button (indicates already following)
        const msgBtn = await page.locator('[data-e2e="message-button"]');
        if (await msgBtn.count() > 0) {
            return { success: true, message: 'Already following — message button present' };
        }
        
        return { success: false, error: 'Follow element not found on this profile page' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// LIKE — Like a TikTok video
// ============================================================
async function handleLike(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(3000 + Math.random() * 2000);
        
        // Strategy 1: data-e2e like icon
        const likeBtn = await page.locator('[data-e2e="like-icon"], [data-e2e="browse-like-icon"]');
        if (await likeBtn.count() > 0) {
            // Check if already liked (the icon color changes)
            const ariaLabel = await likeBtn.first().getAttribute('aria-label') || '';
            if (ariaLabel.toLowerCase().includes('unlike')) {
                return { success: true, message: 'Already liked this video' };
            }
            
            await likeBtn.first().click();
            await page.waitForTimeout(1500);
            return { success: true };
        }
        
        // Strategy 2: Generic heart icon fallback
        const heartIcon = await page.locator('span[class*="SpanIconWrapper"]:first-child, div[class*="like-btn"]');
        if (await heartIcon.count() > 0) {
            await heartIcon.first().click();
            await page.waitForTimeout(1500);
            return { success: true };
        }
        
        return { success: false, error: 'Like element not found on this video page' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// COMMENT — Post a comment on a TikTok video
// ============================================================
async function handleComment(page, targetUrl, content) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(3000 + Math.random() * 1000);
        
        // Scroll to reveal comment section
        await page.evaluate(() => window.scrollBy(0, 400));
        await page.waitForTimeout(1000);
        
        // Strategy 1: data-e2e comment input
        const commentInput = await page.locator('[data-e2e="comment-input"], div[data-e2e="comment-input"] div[contenteditable]');
        if (await commentInput.count() > 0) {
            await commentInput.first().click();
            await page.waitForTimeout(500 + Math.random() * 500);
            
            // TikTok uses contenteditable, so type via keyboard
            await page.keyboard.type(content, { delay: 30 + Math.random() * 40 });
            await page.waitForTimeout(1000 + Math.random() * 500);
            
            // Click post button
            const postBtn = await page.locator('[data-e2e="comment-post"], button[data-e2e="comment-post-button"]');
            if (await postBtn.count() > 0) {
                await postBtn.first().click();
            } else {
                await page.keyboard.press('Enter');
            }
            
            await page.waitForTimeout(3000);
            return { success: true };
        }
        
        // Strategy 2: Draft editor fallback
        const draftEditor = await page.locator('.public-DraftEditor-content, div[contenteditable="true"]');
        if (await draftEditor.count() > 0) {
            await draftEditor.first().click();
            await page.keyboard.type(content, { delay: 30 + Math.random() * 40 });
            await page.waitForTimeout(1000);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(3000);
            return { success: true };
        }
        
        return { success: false, error: 'Comment box not accessible — may require login or comments disabled' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// VIEW — Watch a TikTok video for a specified duration
// ============================================================
async function handleView(page, targetUrl, duration) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1000);
        
        const viewDuration = parseInt(duration) || 30000;
        
        // Ensure the video is playing
        await page.evaluate(() => {
            const video = document.querySelector('video');
            if (video && video.paused) {
                video.play().catch(() => {});
            }
        });
        
        // Simulate occasional mouse movements to prevent idle detection
        const mouseInterval = setInterval(async () => {
            try {
                await page.mouse.move(
                    200 + Math.random() * 600,
                    200 + Math.random() * 400
                );
            } catch (e) {}
        }, 10000);

        await page.waitForTimeout(viewDuration);
        
        clearInterval(mouseInterval);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// CREATE ACCOUNT — TikTok signup (email-based)
// ============================================================
async function handleCreateAccount(page, task, paths, accountTemplate, proxy) {
    try {
        let success = false;
        let pAcc = null;

        const methods = [
            // METHOD 1: Email signup
            async () => {
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

                await page.goto('https://www.tiktok.com/signup', { waitUntil: 'load' });
                if (cursor) await cursor.move({ x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 });
                await page.waitForTimeout(3000 + Math.random() * 3000);
                
                // Click "Use phone or email"
                const emailSignup = await page.locator('[data-e2e="channel-item"], div[class*="channel-item"]');
                const count = await emailSignup.count();
                for (let i = 0; i < count; i++) {
                    const text = await emailSignup.nth(i).innerText();
                    if (text.toLowerCase().includes('email') || text.toLowerCase().includes('phone') || text.toLowerCase().includes('telefon')) {
                        await smartClick('[data-e2e="channel-item"], div[class*="channel-item"] >> nth=' + i);
                        await page.waitForTimeout(2000);
                        break;
                    }
                }
                
                const { generateIdentity } = require('../core/identity');
                const identity = generateIdentity();
                const password = identity.password;
                
                // Fill in birthday
                const monthSelect = await page.locator('select[data-e2e="month-select"], select:nth-of-type(1)');
                if (await monthSelect.count() > 0) {
                    await monthSelect.first().selectOption({ index: identity.dob.month });
                    const daySelect = await page.locator('select[data-e2e="day-select"], select:nth-of-type(2)');
                    if (await daySelect.count() > 0) await daySelect.first().selectOption({ index: Math.min(identity.dob.day, 28) });
                    const yearSelect = await page.locator('select[data-e2e="year-select"], select:nth-of-type(3)');
                    if (await yearSelect.count() > 0) await yearSelect.first().selectOption(identity.dob.year.toString());
                    
                    await page.waitForTimeout(1000);
                }
                
                // Ensure Email tab is active 
                const emailTab = await page.locator('a[data-e2e="email-tab"], a:has-text("Sign up with email")');
                if (await emailTab.count() > 0) await smartClick('a[data-e2e="email-tab"], a:has-text("Sign up with email")');
                
                const tempEmailModule = require('../core/temp-email');
                const { email, login, domain } = await tempEmailModule.generateEmail('tiktok');
                
                const emailInput = await page.locator('input[name="email"], input[type="text"][placeholder*="email" i], input[type="email"]');
                if (await emailInput.count() > 0) {
                    await emailInput.first().focus();
                    await page.keyboard.type(email, { delay: 60 + Math.random() * 50 });
                    await page.waitForTimeout(1000);
                }
                
                // Password
                const passInput = await page.locator('input[type="password"]');
                if (await passInput.count() > 0) {
                    await passInput.first().focus();
                    await page.keyboard.type(password, { delay: 60 + Math.random() * 50 });
                }
                
                // Click Send Code
                await smartClick('button[data-e2e="send-code-button"]');
                await page.waitForTimeout(4000);
                
                // Check for captcha BEFORE email verify
                let isCaptchaTriggered = await page.locator('div[id*="captcha"], iframe[src*="captcha"]').count() > 0;
                if (isCaptchaTriggered) {
                    const captchaSolver = require('../core/captcha-solver');
                    const solveRes = await captchaSolver.solvePlaywrightVisual(page);
                    if (solveRes.success) isCaptchaTriggered = false;
                }
                
                // Wait for email code for up to 60s
                let code = null;
                const mailInfo = await tempEmailModule.waitForCode(login, domain, 60000);
                if (mailInfo.found && mailInfo.code) {
                    code = mailInfo.code;
                }
                
                if (!code) {
                    return { error: 'Email check timeout on TikTok' };
                }
                
                // Enter code
                const codeInput = await page.locator('input[placeholder*="code" i], input[data-e2e="code-input"]');
                if (await codeInput.count() > 0) {
                    await codeInput.first().focus();
                    await page.keyboard.type(code, { delay: 80 + Math.random() * 50 });
                }
                
                await page.waitForTimeout(2000);
                
                // Submit
                const submitBtn = await page.locator('button[data-e2e="next-button"], button[type="submit"]');
                if (await submitBtn.count() > 0) {
                    await smartClick('button[data-e2e="next-button"], button[type="submit"]');
                    await page.waitForTimeout(5000);
                }
                
                return {
                    username: identity.username,
                    email,
                    password,
                    displayName: identity.displayName,
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
                        password: res.password,
                        platform: 'tiktok',
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
        return { success: false, error: 'TikTok account creation failed — captcha or anti-bot triggered' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = { executeAction };
