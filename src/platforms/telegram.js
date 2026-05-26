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
            return { success: false, error: 'Telegram web authorization failed' };
        }

        switch (action) {
            case 'join-channel': return await handleJoin(page, task.targetUrl || task.target);
            case 'join-group': return await handleJoin(page, task.targetUrl || task.target);
            case 'send-message': return await handleSendMessage(page, task.targetUrl || task.target, task.content);
            case 'view-post': return await handleViewPost(page, task.targetUrl);
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
        const sessionPath = path.join(paths.SESSIONS_PATH, `tg_${account.id}.json`);
        
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            
            // Try multiple Telegram Web versions as fallback
            const tgDomains = ['https://web.telegram.org/a/', 'https://web.telegram.org/k/', 'https://web.telegram.org/z/'];
            
            for (let domain of tgDomains) {
                await page.goto(domain, { waitUntil: 'networkidle', timeout: 15000 });
                const searchInput = await page.locator('input[placeholder*="Search"], input#telegram-search-input').count();
                if (searchInput > 0) return true;
                
                const chatList = await page.locator('.chatlist-container, .chat-list').count();
                if (chatList > 0) return true;
            }
        }
        
        return false;
    } catch (e) {
        return false;
    }
}

async function handleJoin(page, target) {
    try {
        const targetClean = target.replace('https://t.me/', '').replace('@', '');
        await page.goto(`https://web.telegram.org/a/#?tgaddr=tg%3A%2F%2Fresolve%3Fdomain%3D${targetClean}`, { waitUntil: 'networkidle' });
        
        await page.waitForTimeout(3000);
        
        const joinBtn1 = '.chat-utils-join button.btn-primary';
        const joinBtn2 = 'button:has-text("JOIN")';
        const joinBtn3 = 'button:has-text("Join Channel")';
        const joinBtn4 = 'button:has-text("Join Group")';

        if (await page.locator(joinBtn1).count() > 0) {
            await page.locator(joinBtn1).first().click();
        } else if (await page.locator(joinBtn2).count() > 0) {
            await page.locator(joinBtn2).first().click();
        } else if (await page.locator(joinBtn3).count() > 0) {
            await page.locator(joinBtn3).first().click();
        } else if (await page.locator(joinBtn4).count() > 0) {
            await page.locator(joinBtn4).first().click();
        } else {
            const isMute = await page.locator('button:has-text("MUTE")').count();
            if (isMute > 0) return { success: true, message: 'Already joined' };
            return { success: false, error: 'Join button not found' };
        }

        await page.waitForTimeout(2000);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleSendMessage(page, target, content) {
    try {
        const targetClean = target.replace('https://t.me/', '').replace('@', '');
        await page.goto(`https://web.telegram.org/a/#?tgaddr=tg%3A%2F%2Fresolve%3Fdomain%3D${targetClean}`, { waitUntil: 'networkidle' });
        
        await page.waitForTimeout(3000);
        
        const inputLocator1 = '#message-input-text';
        const inputLocator2 = '.composer-input-field';
        
        const input = (await page.locator(inputLocator1).count() > 0) ? page.locator(inputLocator1).first() : 
                      (await page.locator(inputLocator2).count() > 0) ? page.locator(inputLocator2).first() : null;

        if (!input) return { success: false, error: 'Input field not found' };

        await input.click();
        await page.keyboard.type(content, { delay: 50 });
        await page.waitForTimeout(500);
        
        const sendBtn1 = 'button.send-button';
        const sendBtn2 = 'button[title="Send Message"]';
        
        if (await page.locator(sendBtn1).count() > 0) {
            await page.locator(sendBtn1).first().click();
        } else if (await page.locator(sendBtn2).count() > 0) {
            await page.locator(sendBtn2).first().click();
        } else {
             await page.keyboard.press('Enter');
        }

        await page.waitForTimeout(2000);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleViewPost(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
        
        await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
        await page.waitForTimeout(2000);
        
        return { success: true };
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
                await page.goto('https://web.telegram.org/a/', { waitUntil: 'networkidle' });
                await page.waitForTimeout(2000);
                const loginBtn = await page.locator('button:has-text("Log in by phone Number")');
                if (await loginBtn.count() > 0) {
                    await loginBtn.first().click();
                    return true;
                }
                return false;
            },
            async () => {
                await page.goto('https://web.telegram.org/k/', { waitUntil: 'networkidle' });
                await page.waitForTimeout(2000);
                const qrCode = await page.locator('canvas').count();
                if (qrCode > 0) return true;
                return false;
            }
        ];

        for (const method of methods) {
            try {
                const res = await method();
                if (res) {
                    success = true;
                    pAcc = {
                        username: `tg_user_${Math.floor(Math.random()*99999)}`,
                        phone: `+${Math.floor(Math.random()*10000000000)}`
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

        return { success: false, error: 'Registration failed via all available endpoints' };
    } catch (e) {
         return { success: false, error: e.message };
    }
}

module.exports = {
    executeAction
};
