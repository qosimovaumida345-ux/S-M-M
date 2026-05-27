const browserManager = require('../core/browser');
const captchaSolver = require('../core/captcha-solver');
const fs = require('fs');
const path = require('path');

async function executeAction(action, account, task, proxy, paths) {
    const { browser, context } = await browserManager.launchBrowser(proxy, task.headless);
    
    try {
        const page = await context.newPage();
        
        if (action === 'create-account') {
            return await handleCreateAccount(page, task, paths, proxy);
        }

        const loggedIn = await login(page, account, paths);
        if (!loggedIn) {
             return { success: false, error: 'Authentication failed or bot detected during login.' };
        }

        switch (action) {
            case 'follow':
                return await handleFollow(page, task.target);
            case 'like':
                return await handleLike(page, task.targetUrl);
            case 'comment':
                return await handleComment(page, task.targetUrl, task.content || 'Nice post! 🔥');
            default:
                return { success: false, error: `Action ${action} not supported on Instagram.` };
        }

    } catch (e) {
        return { success: false, error: `Critical platform error: ${e.message}` };
    } finally {
        await browser.close();
    }
}

async function login(page, account, paths) {
    try {
        const sessionPath = path.join(paths.SESSIONS_PATH, `ig_${account.id}.json`);
        
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            await page.goto('https://www.instagram.com/', { waitUntil: 'load' });
            await page.waitForTimeout(2000);
            
            const isLoggedIn = await page.evaluate(() => document.cookie.includes('sessionid') || document.cookie.includes('ds_user_id'));
            if (isLoggedIn) return true;
        }

        const methods = [
            async () => {
                await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle' });
                await page.waitForTimeout(2000);

                const usernameInput = await page.locator('input[name="username"]');
                if (await usernameInput.count() > 0) {
                    await usernameInput.first().fill(account.username);
                    await page.waitForTimeout(500 + Math.random() * 500);
                    
                    const passwordInput = await page.locator('input[name="password"]');
                    await passwordInput.first().fill(account.password);
                    await page.waitForTimeout(500 + Math.random() * 500);
                    
                    const submitBtn = await page.locator('button[type="submit"]');
                    if (await submitBtn.count() > 0) {
                        await submitBtn.first().click();
                        return true;
                    }
                }
                return false;
            }
        ];

        let loginSuccess = false;
        for (const method of methods) {
            try {
                if (await method()) {
                    await page.waitForTimeout(5000);
                    const url = page.url();
                    
                    if (url.includes('challenge')) {
                        throw new Error('Challenge/Captcha required. Requires manual intervention.');
                    }
                    if (url.includes('suspended')) {
                        throw new Error('Account suspended.');
                    }
                    
                    loginSuccess = true;
                    break;
                }
            } catch (e) {}
        }

        if (loginSuccess) {
            const cookies = await page.context().cookies();
            fs.writeFileSync(sessionPath, JSON.stringify(cookies));
            return true;
        }
        
        return false;
    } catch (e) {
        return false;
    }
}

async function handleFollow(page, targetUsername) {
    try {
        const targetClean = targetUsername.replace('@', '');
        await page.goto(`https://www.instagram.com/${targetClean}/`, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1000);
        
        // Multi-language abstract selector for follow button
        const followBtn = await page.locator('button._acan._acap._acas._aj1-, button:has-text("Follow"), button:has-text("Kuzatish"), button:has-text("Подписаться")');
        
        if (await followBtn.count() > 0) {
            await followBtn.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        } 
        
        // Check if already following
        const followingBtn = await page.locator('button._acan._acap._acat._aj1-, button:has-text("Following"), button:has-text("Requested")');
        if (await followingBtn.count() > 0) {
            return { success: true, message: 'Already following or requested.' };
        }
        
        return { success: false, error: 'Follow button not found or blocked by language constraints.' };
    } catch (e) {
         return { success: false, error: e.message };
    }
}

async function handleLike(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1500);
        
        // Scroll slightly like human
        await page.evaluate(() => window.scrollBy(0, 300));
        await page.waitForTimeout(1000);

        // Language agnostic like button SVG
        const likeBtnSvg = await page.locator('svg[aria-label="Like"], svg[aria-label="Нравится"], svg[aria-label="Yoqdi"]');
        
        if (await likeBtnSvg.count() > 0) {
            await likeBtnSvg.first().click();
            await page.waitForTimeout(1500);
            return { success: true };
        }
        
        const unlikeBtnSvg = await page.locator('svg[aria-label="Unlike"], svg[aria-label="Не нравится"], svg[aria-label="Yoqmadi"]');
        if (await unlikeBtnSvg.count() > 0) {
            return { success: true, message: 'Already liked.' };
        }

        // Generic fallback class selector for double tap like
        const imageArea = await page.locator('div._aagw');
        if (await imageArea.count() > 0) {
            await imageArea.first().dblclick();
            await page.waitForTimeout(1500);
            return { success: true };
        }
        
        return { success: false, error: 'Like element not found.' };
    } catch(e) {
        return { success: false, error: e.message };
    }
}

async function handleComment(page, targetUrl, content) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1000);
        
        // Language generic textarea selector
        const commentBox = await page.locator('textarea._ablz, textarea[placeholder*="comment" i], textarea[placeholder*="комментари" i], textarea[placeholder*="fikr" i]');
        
        if (await commentBox.count() > 0) {
            await commentBox.first().click();
            await page.waitForTimeout(500 + Math.random() * 500);
            await commentBox.first().fill(content);
            await page.waitForTimeout(1000 + Math.random() * 500);
            
            // Post button generic
            const postBtn = await page.locator('div[role="button"]:has-text("Post"), div[role="button"]:has-text("Опубликовать"), div[role="button"]:has-text("Ulashish")');
            if (await postBtn.count() > 0) {
                await postBtn.first().click();
            } else {
                await page.keyboard.press('Enter');
            }
            
            await page.waitForTimeout(3000);
            return { success: true };
        }
        
        return { success: false, error: 'Comment box not accessible' };
    } catch(e) {
        return { success: false, error: e.message };
    }
}

async function handleCreateAccount(page, task, paths, proxy) {
    try {
        let success = false;
        let pAcc = null;

        const methods = [
            async () => {
                // Ensure we navigate to the mobile version
                await page.goto('https://m.instagram.com/accounts/emailsignup/', { waitUntil: 'load' });
                await page.waitForTimeout(3000 + Math.random() * 2000);
                
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
                
                if (cursor) await cursor.move({ x: 150 + Math.random() * 200, y: 150 + Math.random() * 200 });
                
                const emailInput = await page.locator('input[name="emailOrPhone"], input[type="email"], input[type="tel"]');
                if (await emailInput.count() > 0) {
                    const smsService = require('../core/sms-service');
                    const rentResp = await smsService.getNumber('ig', '0'); // ig = Instagram
                    
                    if (!rentResp.success) {
                        return { error: 'SMS API Failed to rent number: ' + rentResp.error };
                    }
                    
                    let phoneNumber = rentResp.number;
                    if (phoneNumber.startsWith('+')) phoneNumber = phoneNumber.substring(1);
                    
                    const { generateIdentity } = require('../core/identity');
                    const identity = generateIdentity();
                    
                    await emailInput.first().focus();
                    await page.keyboard.type('+' + phoneNumber, { delay: 60 + Math.random() * 50 });
                    await page.waitForTimeout(1000 + Math.random() * 500);
                    
                    const nameInput = await page.locator('input[name="fullName"], input[aria-label="Full Name"]');
                    if (await nameInput.count() > 0) {
                        await nameInput.first().focus();
                        await page.keyboard.type(identity.displayName, { delay: 60 + Math.random() * 50 });
                        await page.waitForTimeout(800 + Math.random() * 500);
                    }
                    
                    const userInput = await page.locator('input[name="username"]');
                    if (await userInput.count() > 0) {
                        await userInput.first().focus();
                        await page.keyboard.press('Control+A'); // clear if suggested
                        await page.keyboard.type(identity.username, { delay: 60 + Math.random() * 50 });
                        await page.waitForTimeout(800 + Math.random() * 500);
                    }
                    
                    const passInput = await page.locator('input[name="password"]');
                    if (await passInput.count() > 0) {
                        await passInput.first().focus();
                        await page.keyboard.type(identity.password, { delay: 50 + Math.random() * 30 });
                    }
                    
                    await page.waitForTimeout(1500 + Math.random() * 1000);
                    
                    // Click SignUp / Next button
                    const submitBtn = await page.locator('button[type="submit"], div[role="button"]:has-text("Sign up"), div[role="button"]:has-text("Next")');
                    if (await submitBtn.count() > 0) {
                        await smartClick('button[type="submit"], div[role="button"]:has-text("Sign up"), div[role="button"]:has-text("Next")');
                        await page.waitForTimeout(6000);
                        
                        // Check for Captcha BEFORE SMS verify
                        let isCaptchaTriggered = await page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[title*="recaptcha"]').count() > 0;
                        if (isCaptchaTriggered) {
                            const captchaSolver = require('../core/captcha-solver');
                            const solveRes = await captchaSolver.solvePlaywrightVisual(page);
                            if (solveRes.success) isCaptchaTriggered = false;
                        }

                        // Wait for SMS code
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
                            return { error: 'SMS check timeout on Instagram' };
                        }
                        
                        const verifyInput = await page.locator('input[name="confirmationCode"], input[aria-label*="code" i]');
                        if (await verifyInput.count() > 0) {
                            await verifyInput.first().focus();
                            await page.keyboard.type(code, { delay: 80 + Math.random() * 50 });
                            await page.waitForTimeout(1500);
                            await smartClick('button[type="button"]:has-text("Next"), button[type="button"]:has-text("Confirm")');
                            await page.waitForTimeout(5000);
                        }

                        return { user: identity.username, pass: identity.password, phone: phoneNumber, captchaTriggered: isCaptchaTriggered };
                    }
                }
                return null;
            }
        ];

        for (const method of methods) {
            try {
                const res = await method();
                if (res) {
                    success = true;
                    pAcc = { username: res.user, password: res.pass, email: res.email };
                    break;
                }
            } catch (err) {
                 continue;
            }
        }

        if (success) {
            return { success: true, account: pAcc };
        }

        return { success: false, error: 'Anti-bot triggers blocked all creation methods or selectors changed.' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = {
    executeAction
};
