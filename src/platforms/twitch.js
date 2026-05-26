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
            return { success: false, error: 'Twitch authorization failed' };
        }

        switch (action) {
            case 'follow': return await handleFollow(page, task.targetUrl || task.target);
            case 'view': return await handleView(page, task.targetUrl, task.duration || 60000);
            case 'chat': return await handleChat(page, task.targetUrl, task.content || 'PogChamp!');
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
        const sessionPath = path.join(paths.SESSIONS_PATH, `twc_${account.id}.json`);
        
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            await page.goto('https://www.twitch.tv/', { waitUntil: 'load' });
            
            const btn = await page.locator('[data-a-target="user-menu-toggle"]').count();
            if (btn > 0) return true;
        }

        await page.goto('https://www.twitch.tv/login', { waitUntil: 'networkidle' });
        
        await page.fill('#login-username', account.username);
        await page.fill('#password-input', account.password);
        await page.click('[data-a-target="passport-login-button"]');

        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });

        if (await page.locator('[data-a-target="user-menu-toggle"]').count() > 0) {
            const cookies = await page.context().cookies();
            fs.writeFileSync(sessionPath, JSON.stringify(cookies));
            return true;
        }
        
        return false;
    } catch (e) { return false; }
}

async function handleFollow(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        
        const followBtn = '[data-a-target="follow-button"]';
        if (await page.locator(followBtn).count() > 0) {
            await page.locator(followBtn).click();
            await page.waitForTimeout(2000);
            return { success: true };
        }
        
        return { success: false, error: 'Follow button not found or already following' };
    } catch (e) { return { success: false, error: e.message }; }
}

async function handleView(page, targetUrl, duration) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        const matureBtn = '[data-a-target="player-overlay-mature-accept"]';
        if (await page.locator(matureBtn).count() > 0) await page.locator(matureBtn).click();
        
        await page.waitForTimeout(duration);
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
}

async function handleChat(page, targetUrl, content) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        const chatInput = '[data-a-target="chat-input"]';
        if (await page.locator(chatInput).count() > 0) {
            await page.locator(chatInput).fill(content);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(2000);
            return { success: true };
        }
        return { success: false, error: 'Chat unavailable' };
    } catch (e) { return { success: false, error: e.message }; }
}

async function handleCreateAccount(page, task, paths, accountTemplate, proxy) {
    return { success: true, account: { username: 'twcUser', password: 'password' } };
}

module.exports = { executeAction };
