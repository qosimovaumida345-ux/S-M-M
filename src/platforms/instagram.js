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
                
                // Using less restrictive selectors (works for both m.instagram and www.instagram)
                const emailInput = await page.locator('input[name="emailOrPhone"], input[type="email"], input[type="tel"]');
                if (await emailInput.count() > 0) {
                    const tempEmail = `ig_${Math.random().toString(36).substring(7)}@example.com`;
                    await emailInput.first().fill(tempEmail);
                    await page.waitForTimeout(1000);
                    
                    const nameInput = await page.locator('input[name="fullName"], input[aria-label="Full Name"]');
                    if (await nameInput.count() > 0) await nameInput.first().fill('Alex Smith');
                    
                    const userInput = await page.locator('input[name="username"]');
                    const username = `alexsmith_${Math.random().toString(36).substring(7)}`;
                    if (await userInput.count() > 0) await userInput.first().fill(username);
                    
                    const passInput = await page.locator('input[name="password"]');
                    const password = `IgPass!${Math.random().toString(36).substring(7)}`;
                    if (await passInput.count() > 0) await passInput.first().fill(password);
                    
                    await page.waitForTimeout(1500);
                    
                    // Click SignUp / Next button
                    const submitBtn = await page.locator('button[type="submit"], div[role="button"]:has-text("Sign up"), div[role="button"]:has-text("Next")');
                    if (await submitBtn.count() > 0) {
                        await submitBtn.first().click();
                        await page.waitForTimeout(5000);
                        
                        // Check for any Recaptcha / hCaptcha overlapping forms
                        let isCaptchaTriggered = await page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[title*="recaptcha"]').count() > 0;
                        if (isCaptchaTriggered) {
                            const captchaSolver = require('../core/captcha-solver');
                            const solveRes = await captchaSolver.solvePlaywrightVisual(page);
                            if (solveRes.success) isCaptchaTriggered = false;
                        }

                        return { user: username, pass: password, email: tempEmail, captchaTriggered: isCaptchaTriggered };
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
