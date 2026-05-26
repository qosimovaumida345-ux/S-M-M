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
            return { success: false, error: 'Roblox authorization failed' };
        }

        switch (action) {
            case 'follow': return await handleFollow(page, task.targetUrl || task.target);
            case 'favorite': return await handleFavorite(page, task.targetUrl);
            case 'join-group': return await handleJoinGroup(page, task.targetUrl);
            case 'gamepass': return await handleGamepass(page, task.targetUrl);
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
        const sessionPath = path.join(paths.SESSIONS_PATH, `rbx_${account.id}.json`);
        
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            await page.goto('https://www.roblox.com/home', { waitUntil: 'networkidle' });
            if (await page.locator('.age-bracket-label').count() > 0) return true;
        }

        await page.goto('https://www.roblox.com/login', { waitUntil: 'networkidle' });
        
        await page.fill('#login-username', account.username);
        await page.fill('#login-password', account.password);
        await page.click('#login-button');
        
        await page.waitForNavigation({ waitUntil: 'networkidle' });

        if (await page.locator('#two-step-verification-code-input').count() > 0) {
            throw new Error("2FA required");
        }

        if (await page.locator('.age-bracket-label').count() > 0) {
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
        
        const moreBtn = '.profile-header-more-container button';
        if (await page.locator(moreBtn).count() > 0) {
             await page.locator(moreBtn).first().click();
             await page.waitForTimeout(1000);
             const followBtn = '.popover-content li:has-text("Follow")';
             if (await page.locator(followBtn).count() > 0) {
                 await page.locator(followBtn).first().click();
                 await page.waitForTimeout(2000);
                 return { success: true };
             }
        }
        return { success: false, error: 'Follow option unavailable' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleFavorite(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        
        const favBtn = '#favorite-button';
        if (await page.locator(favBtn).count() > 0) {
            const isFaved = await page.locator(favBtn).getAttribute('class');
            if (!isFaved.includes('icon-favorite')) {
                 await page.locator(favBtn).click();
                 await page.waitForTimeout(2000);
                 return { success: true };
            }
            return { success: true, message: 'Already favorited' };
        }
        return { success: false, error: 'Favorite button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleJoinGroup(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        
        const joinBtn = '.group-buttons button:has-text("Join Group")';
        if (await page.locator(joinBtn).count() > 0) {
            await page.locator(joinBtn).click();
            await page.waitForTimeout(3000);
            return { success: true };
        }
        return { success: false, error: 'Join button not found or already joined' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleGamepass(page, targetUrl) {
     try {
         await page.goto(targetUrl, { waitUntil: 'networkidle' });
         const buyBtn = 'button.btn-growth-lg';
         if (await page.locator(buyBtn).count() > 0) {
             await page.locator(buyBtn).click();
             await page.waitForTimeout(1000);
             const confirmBtn = 'button:has-text("Buy Now")';
             if(await page.locator(confirmBtn).count() > 0) {
                 await page.locator(confirmBtn).click();
                 return { success: true };
             }
         }
         return { success: false, error: 'Could not buy Gamepass' };
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
                await page.goto('https://www.roblox.com/', { waitUntil: 'networkidle' });
                await page.waitForTimeout(1500);
                await page.selectOption('#MonthDropdown', '01');
                await page.selectOption('#DayDropdown', '01');
                await page.selectOption('#YearDropdown', '2000');
                const user = `rbx_${Math.random().toString(36).substring(7)}`;
                const pass = `RbxPassword${Math.random().toString(36).substring(7)}`;
                await page.fill('#signup-username', user);
                await page.fill('#signup-password', pass);
                await page.click('#MaleButton');
                await page.click('#signup-button');
                await page.waitForTimeout(4000);
                return { u: user, p: pass };
            },
            async () => {
                await page.goto('https://www.roblox.com/roblox-app', { waitUntil: 'networkidle' });
                return false; 
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

        return { success: false, error: 'Registration failed' };
    } catch (e) {
         return { success: false, error: e.message };
    }
}

module.exports = {
    executeAction
};
