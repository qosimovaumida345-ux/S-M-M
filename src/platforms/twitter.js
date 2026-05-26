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
            return { success: false, error: 'X/Twitter authorization failed' };
        }

        switch (action) {
            case 'follow': return await handleFollow(page, task.targetUrl || task.target);
            case 'like': return await handleLike(page, task.targetUrl);
            case 'retweet': return await handleRetweet(page, task.targetUrl);
            case 'comment': return await handleComment(page, task.targetUrl, task.content || 'Great thread!');
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
        const sessionPath = path.join(paths.SESSIONS_PATH, `tw_${account.id}.json`);
        
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            await page.goto('https://x.com/home', { waitUntil: 'load' });
            
            const navExists = await page.locator('[data-testid="AppTabBar_Home_Link"]').count();
            if (navExists > 0) return true;
        }

        await page.goto('https://x.com/i/flow/login', { waitUntil: 'networkidle' });
        
        await page.fill('input[autocomplete="username"]', account.username);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
        
        const passwordInput = await page.locator('input[autocomplete="current-password"]');
        if (await passwordInput.isVisible()) {
            await passwordInput.fill(account.password);
            await page.keyboard.press('Enter');
            await page.waitForNavigation({ waitUntil: 'networkidle' });
        } else {
             const manualCheck = await page.locator('input[data-testid="ocfEnterTextTextInput"]');
             if (await manualCheck.isVisible()) {
                 await manualCheck.fill(account.email || account.phone);
                 await page.keyboard.press('Enter');
                 await page.waitForTimeout(2000);
                 await page.fill('input[autocomplete="current-password"]', account.password);
                 await page.keyboard.press('Enter');
                 await page.waitForNavigation({ waitUntil: 'networkidle' });
             }
        }

        if (await page.locator('[data-testid="AppTabBar_Home_Link"]').count() > 0) {
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
        let target = targetUrl.includes('x.com') || targetUrl.includes('twitter.com') ? targetUrl : `https://x.com/${targetUrl.replace('@', '')}`;
        await page.goto(target, { waitUntil: 'networkidle' });
        
        const followBtn1 = '[data-testid="placementTracking"] button[data-testid$="-follow"]';
        const followBtn2 = 'div[data-testid="primaryColumn"] div[role="button"]:has-text("Follow")';
        
        if (await page.locator(followBtn1).count() > 0) {
            await page.locator(followBtn1).first().click();
        } else if (await page.locator(followBtn2).count() > 0) {
            await page.locator(followBtn2).first().click();
        } else {
             const isFollowing = await page.locator('button[data-testid$="-unfollow"]').count();
             if (isFollowing > 0) return { success: true };
             return { success: false, error: 'Follow element not found' };
        }
        
        await page.waitForTimeout(1500);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleLike(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        
        const likeBtn = '[data-testid="like"]';
        const unLikeBtn = '[data-testid="unlike"]';
        
        if (await page.locator(unLikeBtn).count() > 0) return { success: true };
        
        if (await page.locator(likeBtn).count() > 0) {
            await page.locator(likeBtn).first().click();
            await page.waitForTimeout(1000);
            return { success: true };
        }
        
        return { success: false, error: 'Like button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleRetweet(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        
        const rtBtn = '[data-testid="retweet"]';
        const unRtBtn = '[data-testid="unretweet"]';
        
        if (await page.locator(unRtBtn).count() > 0) return { success: true };
        
        if (await page.locator(rtBtn).count() > 0) {
            await page.locator(rtBtn).first().click();
            await page.waitForTimeout(500);
            const confirmRt = '[data-testid="retweetConfirm"]';
            if (await page.locator(confirmRt).count() > 0) {
                await page.locator(confirmRt).first().click();
                await page.waitForTimeout(1000);
                return { success: true };
            }
        }
        
        return { success: false, error: 'Retweet sequence failed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleComment(page, targetUrl, content) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        
        const replyInput = '[data-testid="tweetTextarea_0"]';
        if (await page.locator(replyInput).count() > 0) {
            await page.locator(replyInput).first().click();
            await page.keyboard.type(content, { delay: 50 });
            await page.waitForTimeout(500);
            const replySubmit = '[data-testid="tweetButtonInline"]';
            if (await page.locator(replySubmit).count() > 0) {
                await page.locator(replySubmit).first().click();
                await page.waitForTimeout(2000);
                return { success: true };
            }
        }
        return { success: false, error: 'Comment input not available' };
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
                await page.goto('https://x.com/i/flow/signup', { waitUntil: 'networkidle' });
                await page.waitForTimeout(2000);
                await page.locator('span:has-text("Create account")').click();
                await page.waitForTimeout(1000);
                
                const name = `XUser_${Math.floor(Math.random() * 999)}`;
                await page.fill('input[name="name"]', name);
                
                await page.locator('span:has-text("Use email instead")').click();
                const email = `${name.toLowerCase()}@example.com`;
                await page.fill('input[name="email"]', email);
                
                await page.selectOption('select[aria-labelledby="SELECTOR_1_LABEL"]', { value: '1' });
                await page.selectOption('select[aria-labelledby="SELECTOR_2_LABEL"]', { value: '15' });
                await page.selectOption('select[aria-labelledby="SELECTOR_3_LABEL"]', { value: '2000' });
                
                await page.locator('span:has-text("Next")').last().click();
                await page.waitForTimeout(3000);
                
                const pass = `XStrong${Math.random().toString(36).substring(5)}!`;
                
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

        return { success: false, error: 'All Twitter signup sequences blocked' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = { executeAction };
