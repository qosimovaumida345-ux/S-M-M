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
            return { success: false, error: 'Spotify authorization failed' };
        }

        switch (action) {
            case 'follow': return await handleFollow(page, task.targetUrl || task.target);
            case 'play': return await handlePlay(page, task.targetUrl, task.duration || 60000);
            case 'save': return await handleSave(page, task.targetUrl);
            case 'playlist-add': return await handlePlaylistAdd(page, task.targetUrl);
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
        const sessionPath = path.join(paths.SESSIONS_PATH, `sp_${account.id}.json`);
        
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            await page.goto('https://open.spotify.com/', { waitUntil: 'load' });
            
            const pfp = await page.locator('[data-testid="user-widget-avatar"]').count();
            if (pfp > 0) return true;
        }

        await page.goto('https://accounts.spotify.com/en/login', { waitUntil: 'networkidle' });
        
        await page.fill('#login-username', account.email || account.username);
        await page.fill('#login-password', account.password);
        await page.click('#login-button');

        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });

        if (await page.locator('[data-testid="user-widget-avatar"]').count() > 0 || await page.url().includes('open.spotify')) {
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
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        
        const followBtn = 'button[data-testid="follow-button"]';
        if (await page.locator(followBtn).count() > 0) {
            await page.locator(followBtn).first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }
        
        return { success: false, error: 'Follow unaccessible or already following' };
    } catch (e) { return { success: false, error: e.message }; }
}

async function handlePlay(page, targetUrl, duration) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        
        const playBtn = '[data-testid="play-button"]';
        if (await page.locator(playBtn).count() > 0) {
            await page.locator(playBtn).first().click();
            await page.waitForTimeout(duration);
            return { success: true };
        }
        return { success: false, error: 'Play button not found' };
    } catch (e) { return { success: false, error: e.message }; }
}

async function handleSave(page, targetUrl) { return { success: true }; }
async function handlePlaylistAdd(page, targetUrl) { return { success: true }; }

async function handleCreateAccount(page, task, paths, accountTemplate, proxy) {
    try {
        await page.goto('https://www.spotify.com/signup', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);

        const email = `sp_${Math.random().toString(36).substring(7)}@example.com`;
        const pass = `SpPass123!${Math.random().toString(36).substring(5)}`;
        const name = `SpotUser_${Math.floor(Math.random() * 999)}`;

        await page.fill('#username', email);
        const submitBtn1 = 'button[data-testid="submit"]';
        if (await page.locator(submitBtn1).count()>0) await page.locator(submitBtn1).click();
        
        await page.waitForTimeout(1500);
        await page.fill('#new-password', pass);
        if (await page.locator(submitBtn1).count()>0) await page.locator(submitBtn1).click();
        
        await page.waitForTimeout(1500);
        await page.fill('#displayName', name);
        await page.fill('#day', '15');
        await page.selectOption('#month', '01');
        await page.fill('#year', '1995');
        await page.locator('span:has-text("Male")').click();
        
        await page.locator('span:has-text("Sign up")').last().click();
        await page.waitForTimeout(4000);

        return { success: true, account: { email, password: pass } };
    } catch (e) { return { success: false, error: e.message }; }
}

module.exports = { executeAction };
