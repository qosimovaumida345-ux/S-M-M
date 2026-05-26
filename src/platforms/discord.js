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
            return { success: false, error: 'Discord web authorization failed' };
        }

        switch (action) {
            case 'join-server': return await handleJoinServer(page, task.targetUrl || task.target);
            case 'send-message': return await handleSendMessage(page, task.targetUrl || task.target, task.content || 'Hello!');
            case 'react': return await handleReact(page, task.targetUrl);
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
        const sessionPath = path.join(paths.SESSIONS_PATH, `dc_${account.id}.json`);
        
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            
            await page.goto('https://discord.com/app', { waitUntil: 'load' });
            if (await page.locator('[class*="guilds_"]').count() > 0) return true;
        }

        await page.goto('https://discord.com/login', { waitUntil: 'networkidle' });
        
        await page.fill('input[name="email"]', account.email || account.username);
        await page.fill('input[name="password"]', account.password);
        await page.click('button[type="submit"]');

        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });

        if (await page.locator('[class*="guilds_"]').count() > 0) {
            const cookies = await page.context().cookies();
            fs.writeFileSync(sessionPath, JSON.stringify(cookies));
            return true;
        }
        
        return false;
    } catch (e) {
        return false;
    }
}

async function handleJoinServer(page, targetUrl) {
    try {
        const inviteCode = targetUrl.split('/').pop();
        await page.goto(`https://discord.com/invite/${inviteCode}`, { waitUntil: 'networkidle' });
        
        await page.waitForTimeout(2000);
        
        const acceptBtn = 'button:has-text("Accept Invite")';
        const continueBtn = 'button:has-text("Continue")';
        
        if (await page.locator(acceptBtn).count() > 0) {
            await page.locator(acceptBtn).first().click();
        } else if (await page.locator(continueBtn).count() > 0) {
            await page.locator(continueBtn).first().click();
        } else {
            return { success: false, error: 'Could not find Discord invite button' };
        }
        
        await page.waitForTimeout(3000);
        
        if (await page.locator('[class*="guilds_"]').count() > 0) {
             return { success: true };
        }
        
        return { success: false, error: 'Did not reach server interface' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleSendMessage(page, targetUrl, content) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        
        const chatBox = '[class*="textArea_"]';
        if (await page.locator(chatBox).count() > 0) {
            await page.locator(chatBox).first().click();
            await page.keyboard.type(content, { delay: 40 });
            await page.waitForTimeout(500);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(1000);
            return { success: true };
        }
        
        return { success: false, error: 'Chat box not found or lacking permissions' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleReact(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
        
        const reactBtn = '[aria-label="Add Reaction"]';
        if (await page.locator(reactBtn).count() > 0) {
            await page.locator(reactBtn).locator('visible=true').first().click();
            await page.waitForTimeout(1000);
            
            const firstEmoji = '[class*="emojiItem_"]';
            if (await page.locator(firstEmoji).count() > 0) {
                await page.locator(firstEmoji).first().click();
                await page.waitForTimeout(1000);
                return { success: true };
            }
        }
        
        return { success: false, error: 'Could not react to message' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleCreateAccount(page, task, paths, accountTemplate, proxy) {
    try {
        await page.goto('https://discord.com/register', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        const email = `dc_${Math.random().toString(36).substring(7)}@example.com`;
        const user = `DcUser_${Math.floor(Math.random() * 9999)}`;
        const pass = `DcPass123!${Math.random().toString(36).substring(5)}`;

        await page.fill('input[name="email"]', email);
        await page.fill('input[name="username"]', user);
        await page.fill('input[name="global_name"]', user);
        await page.fill('input[name="password"]', pass);
        
        await page.locator('[class*="month_"]').click();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        
        await page.locator('[class*="day_"]').click();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        
        await page.locator('[class*="year_"]').click();
        for(let i=0; i<25; i++) await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');

        const checkbox = await page.locator('input[type="checkbox"]').first();
        if (await checkbox.isVisible()) await checkbox.check();

        await page.click('button[type="submit"]');
        await page.waitForTimeout(5000);

        const captchaDetected = await page.locator('iframe[src*="hcaptcha"]').count();
        if (captchaDetected > 0) {
             throw new Error('Discord detected automation (hCaptcha intervention)');
        }

        return { success: true, account: { email, username: user, password: pass } };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = { executeAction };
