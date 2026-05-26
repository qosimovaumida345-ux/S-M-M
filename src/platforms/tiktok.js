const browserManager = require('../core/browser');
const fs = require('fs');
const path = require('path');

async function executeAction(action, account, task, proxy, paths) {
    const { browser, context } = await browserManager.launchBrowser(proxy, task.headless);
    
    try {
        const page = await context.newPage();

        if (action === 'create-account') {
            return await handleCreateAccount(page, task, paths, account, proxy);
        }

        const loggedIn = await login(page, account, paths);
        if (!loggedIn) {
            return { success: false, error: 'TikTok authorization failed' };
        }

        switch (action) {
            case 'follow': return await handleFollow(page, task.targetUrl || task.target);
            case 'like': return await handleLike(page, task.targetUrl);
            case 'comment': return await handleComment(page, task.targetUrl, task.content || 'Great video!');
            case 'view': return await handleView(page, task.targetUrl, task.duration || 15000);
            case 'share': return await handleShare(page, task.targetUrl);
            default: return { success: false, error: 'Unsupported action' };
        }
    } catch (e) {
        return { success: false, error: e.message };
    } finally {
        await browser.close();
    }
}

async function login(page, account, paths) {
    try {
        const sessionPath = path.join(paths.SESSIONS_PATH, `tt_${account.id}.json`);
        
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            await page.goto('https://www.tiktok.com/', { waitUntil: 'load' });
            
            const loginBtn = await page.locator('button:has-text("Log in"), button:has-text("Sign in")').count();
            if (loginBtn === 0) return true;
        }

        await page.goto('https://www.tiktok.com/login/phone-or-email', { waitUntil: 'networkidle' });
        
        await page.locator('a:has-text("Log in with phone or email")').click();
        await page.waitForTimeout(1000);
        await page.locator('a:has-text("Log in with email or username")').click();
        await page.waitForTimeout(500);

        await page.fill('input[name="username"]', account.username);
        await page.fill('input[type="password"]', account.password);
        await page.click('button[type="submit"]');

        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });

        const captcha = await page.locator('.captcha-disable-scroll').count();
        if (captcha > 0) throw new Error('Captcha required during login');

        const isLogged = await page.locator('button:has-text("Log in")').count() === 0;
        if (isLogged) {
            const cookies = await page.context().cookies();
            fs.writeFileSync(sessionPath, JSON.stringify(cookies));
            return true;
        }

        return false;
    } catch (e) {
        return false;
    }
}

async function handleFollow(page, targetUrl) {
    try {
        let cleanTarget = targetUrl.includes('tiktok.com') ? targetUrl : `https://www.tiktok.com/@${targetUrl.replace('@', '')}`;
        await page.goto(cleanTarget, { waitUntil: 'networkidle' });
        
        const btn1 = 'button[data-e2e="follow-button"]';
        const btn2 = 'button:has-text("Follow")';
        
        if (await page.locator(btn1).count() > 0) {
            await page.locator(btn1).first().click();
        } else if (await page.locator(btn2).count() > 0) {
            await page.locator(btn2).first().click();
        } else {
            const isFollowing = await page.locator('button:has-text("Message")').count();
            if (isFollowing > 0) return { success: true };
            return { success: false, error: 'Follow button not found' };
        }
        
        await page.waitForTimeout(2000);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleLike(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        
        const btn1 = 'span[data-e2e="like-icon"]';
        const activeLike = 'span[data-e2e="like-icon"] svg[fill="rgb(254, 44, 85)"]';
        
        if (await page.locator(activeLike).count() > 0) return { success: true };
        
        if (await page.locator(btn1).count() > 0) {
            await page.locator(btn1).first().click();
            await page.waitForTimeout(1500);
            return { success: true };
        }
        
        return { success: false, error: 'Like button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleComment(page, targetUrl, content) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        
        const inputContainer = '.DraftEditor-editorContainer div[contenteditable="true"]';
        const input2 = '.public-DraftEditor-content';
        
        if (await page.locator(inputContainer).count() > 0) {
            await page.locator(inputContainer).click();
            await page.keyboard.type(content, { delay: 60 });
        } else if (await page.locator(input2).count() > 0) {
            await page.locator(input2).click();
            await page.keyboard.type(content, { delay: 60 });
        } else {
            return { success: false, error: 'Comment box not found' };
        }
        
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
        
        const postBtn = 'div[data-e2e="comment-post"]';
        if (await page.locator(postBtn).count() > 0) {
            await page.locator(postBtn).click();
        }
        
        await page.waitForTimeout(2000);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleView(page, targetUrl, duration) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        
        await page.waitForTimeout(duration);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleShare(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        
        const shareBtn = 'span[data-e2e="share-icon"]';
        if (await page.locator(shareBtn).count() > 0) {
            await page.locator(shareBtn).click();
            await page.waitForTimeout(1000);
            const copyLink = 'div:has-text("Copy link")';
            if (await page.locator(copyLink).count() > 0) {
                await page.locator(copyLink).first().click();
                await page.waitForTimeout(1000);
                return { success: true };
            }
        }
        return { success: false, error: 'Share process failed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleCreateAccount(page, task, paths, accountTemplate, proxy) {
    try {
        let success = false;
        let pAcc = null;

        const methods = [
            async () => {
                await page.goto('https://www.tiktok.com/signup/phone-or-email', { waitUntil: 'networkidle' });
                await page.waitForTimeout(2000);
                await page.locator('.month-selector').click();
                await page.keyboard.press('ArrowDown');
                await page.keyboard.press('Enter');
                await page.locator('.day-selector').click();
                await page.keyboard.press('ArrowDown');
                await page.keyboard.press('Enter');
                await page.locator('.year-selector').click();
                for(let i=0; i<25; i++) await page.keyboard.press('ArrowDown');
                await page.keyboard.press('Enter');
                
                await page.locator('a:has-text("Sign up with email")').click();
                await page.waitForTimeout(1000);
                
                const email = `ttuser_${Math.random().toString(36).substring(7)}@example.com`;
                const pass = `Tt${Math.random().toString(36).substring(7)}!`;
                await page.fill('input[name="email"]', email);
                await page.fill('input[type="password"]', pass);
                await page.click('button[type="submit"]');
                await page.waitForTimeout(3000);
                return { u: email, p: pass };
            }
        ];

        for (const method of methods) {
            try {
                const res = await method();
                if (res) {
                    success = true;
                    pAcc = { username: res.u, password: res.p };
                    break;
                }
            } catch (err) {
                 continue;
            }
        }

        if (success) {
            return { success: true, account: pAcc };
        }

        return { success: false, error: 'Available sign up mechanisms failed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = { executeAction };
