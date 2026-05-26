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
            return { success: false, error: 'Facebook authorization failed' };
        }

        switch (action) {
            case 'follow': return await handleFollowFaceBook(page, task.targetUrl);
            case 'like-page': return await handleLikePage(page, task.targetUrl);
            case 'like-post': return await handleLikePost(page, task.targetUrl);
            case 'comment': return await handleComment(page, task.targetUrl, task.content || 'Awesome!');
            case 'join-group': return await handleJoinGroup(page, task.targetUrl);
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
        const sessionPath = path.join(paths.SESSIONS_PATH, `fb_${account.id}.json`);
        
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            await page.goto('https://www.facebook.com/', { waitUntil: 'load' });
            
            const navExists = await page.locator('[aria-label="Facebook"]').count();
            if (navExists > 0) return true;
        }

        await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle' });
        
        await page.fill('input[id="email"]', account.email || account.username);
        await page.fill('input[id="pass"]', account.password);
        await page.click('button[name="login"]');
        
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });

        if (await page.locator('[aria-label="Facebook"]').count() > 0) {
            const cookies = await page.context().cookies();
            fs.writeFileSync(sessionPath, JSON.stringify(cookies));
            return true;
        }

        return false;
    } catch (e) {
        return false;
    }
}

async function handleFollowFaceBook(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        const followBtn = 'div[aria-label="Follow"]';
        if (await page.locator(followBtn).count() > 0) {
            await page.locator(followBtn).first().click();
            await page.waitForTimeout(1500);
            return { success: true };
        }
        return { success: false, error: 'Follow button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleLikePage(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        const likeBtn = 'div[aria-label="Like"]';
        if (await page.locator(likeBtn).count() > 0) {
            await page.locator(likeBtn).first().click();
             await page.waitForTimeout(1500);
            return { success: true };
        }
        return { success: false, error: 'Like button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleLikePost(page, targetUrl) {
    return handleLikePage(page, targetUrl);
}

async function handleComment(page, targetUrl, content) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        const commentBox = 'div[aria-label="Write a comment"]';
        if (await page.locator(commentBox).count() > 0) {
            await page.locator(commentBox).first().click();
            await page.keyboard.type(content, { delay: 50 });
            await page.waitForTimeout(500);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(2000);
            return { success: true };
        }
        return { success: false, error: 'Comment box not accessible' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleJoinGroup(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        const joinBtn = 'div[aria-label="Join group"]';
        if (await page.locator(joinBtn).count() > 0) {
            await page.locator(joinBtn).first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }
        return { success: false, error: 'Join group button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleShare(page, targetUrl) {
    return { success: false, error: 'Complex element tracking needed for FB Share' };
}

async function handleCreateAccount(page, task, paths, accountTemplate, proxy) {
    try {
        let success = false;
        let pAcc = null;

        const methods = [
            async () => {
                await page.goto('https://www.facebook.com/r.php', { waitUntil: 'networkidle' });
                await page.waitForTimeout(1500);
                
                await page.fill('input[name="firstname"]', 'John');
                await page.fill('input[name="lastname"]', 'Doe');
                
                const email = `fbuser_${Math.random().toString(36).substring(7)}@example.com`;
                const pass = `FbPass${Math.random().toString(36).substring(5)}!`;
                
                await page.fill('input[name="reg_email__"]', email);
                await page.waitForTimeout(500);
                const confEmail = await page.locator('input[name="reg_email_confirmation__"]');
                if (await confEmail.isVisible()) {
                     await confEmail.fill(email);
                }
                
                await page.fill('input[name="reg_passwd__"]', pass);
                
                await page.selectOption('select[name="birthday_day"]', '1');
                await page.selectOption('select[name="birthday_month"]', '1');
                await page.selectOption('select[name="birthday_year"]', '1995');
                
                await page.click('input[name="sex"][value="2"]'); // Male
                
                await page.click('button[name="websubmit"]');
                await page.waitForTimeout(5000);
                
                if (await page.url().includes('checkpoint')) {
                     throw new Error('Facebook requested security checkpoint');
                }
                
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

        return { success: false, error: 'Registration failed due to strict FB automated prevention' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = { executeAction };
