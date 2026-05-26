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
            return { success: false, error: 'Authorization failed' };
        }

        switch (action) {
            case 'subscribe': return await handleSubscribe(page, task.target);
            case 'like': return await handleLike(page, task.targetUrl);
            case 'dislike': return await handleDislike(page, task.targetUrl);
            case 'comment': return await handleComment(page, task.targetUrl, task.content);
            case 'view': return await handleView(page, task.targetUrl, task.duration);
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
        const sessionPath = path.join(paths.SESSIONS_PATH, `yt_${account.id}.json`);
        
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            await page.goto('https://www.youtube.com/', { waitUntil: 'load' });
            
            const avatar = await page.locator('#avatar-btn').count();
            if (avatar > 0) return true;
        }

        await page.goto('https://accounts.google.com/signin/v2/identifier?service=youtube', { waitUntil: 'networkidle' });
        
        const emailInput = await page.locator('input[type="email"]');
        if (await emailInput.isVisible()) {
            await emailInput.fill(account.email || account.username);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(2000);
            
            const passwordInput = await page.locator('input[type="password"]');
            await passwordInput.fill(account.password);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(3000);
        }

        const ytAvatar = await page.locator('#avatar-btn').count();
        if (ytAvatar > 0) {
            const cookies = await page.context().cookies();
            fs.writeFileSync(sessionPath, JSON.stringify(cookies));
            return true;
        }
        
        return false;
    } catch (e) {
        return false;
    }
}

async function handleSubscribe(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        const subBtnSelector1 = 'ytd-subscribe-button-renderer button:not([subscribed])';
        const subBtnSelector2 = '#subscribe-button paper-button';
        const subBtnSelector3 = '.ytd-subscribe-button-renderer';

        if (await page.locator(subBtnSelector1).count() > 0) {
            await page.locator(subBtnSelector1).first().click();
        } else if (await page.locator(subBtnSelector2).count() > 0) {
             await page.locator(subBtnSelector2).first().click();
        } else if (await page.locator(subBtnSelector3).count() > 0) {
             await page.locator(subBtnSelector3).first().click();
        } else {
             return { success: true }; 
        }

        await page.waitForTimeout(1500);
        
        const verifySub = await page.locator('ytd-subscribe-button-renderer button[subscribed]').count();
        if (verifySub > 0) return { success: true };
        
        return { success: false, error: 'Subscription failed to register' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleLike(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        
        const likeBtn1 = 'ytd-menu-renderer ytd-toggle-button-renderer:nth-child(1) a';
        const likeBtn2 = '.ytd-video-primary-info-renderer ytd-toggle-button-renderer:first-child';
        const likeBtn3 = '#top-level-buttons-computed > ytd-toggle-button-renderer:nth-child(1)';

        let liked = false;
        
        if (await page.locator(likeBtn1).count() > 0) {
            const isPressed = await page.locator(likeBtn1).first().getAttribute('aria-pressed');
            if (isPressed !== 'true') {
                 await page.locator(likeBtn1).first().click();
                 liked = true;
            } else { return { success: true }; }
        } else if (await page.locator(likeBtn2).count() > 0) {
            await page.locator(likeBtn2).first().click();
            liked = true;
        } else if (await page.locator(likeBtn3).count() > 0) {
            await page.locator(likeBtn3).first().click();
            liked = true;
        }

        if (liked) {
            await page.waitForTimeout(1000);
            return { success: true };
        }
        
        return { success: false, error: 'Like button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleDislike(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        
        const dislikeBtn1 = 'ytd-menu-renderer ytd-toggle-button-renderer:nth-child(2) a';
        const dislikeBtn2 = '#top-level-buttons-computed > ytd-toggle-button-renderer:nth-child(2)';

        if (await page.locator(dislikeBtn1).count() > 0) {
            await page.locator(dislikeBtn1).first().click();
            await page.waitForTimeout(1000);
            return { success: true };
        } else if (await page.locator(dislikeBtn2).count() > 0) {
             await page.locator(dislikeBtn2).first().click();
             await page.waitForTimeout(1000);
             return { success: true };
        }
        
        return { success: false, error: 'Dislike button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleComment(page, targetUrl, content) {
    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        
        await page.evaluate(() => window.scrollBy(0, 500));
        await page.waitForTimeout(2000);
        
        const commentBox1 = '#simplebox-placeholder';
        const commentBox2 = 'ytd-comment-simplebox-renderer';
        
        if (await page.locator(commentBox1).count() > 0) {
            await page.locator(commentBox1).first().click();
            await page.waitForTimeout(500);
            const editable = '#contenteditable-root';
            await page.locator(editable).first().fill(content);
            await page.waitForTimeout(500);
            await page.locator('#submit-button').first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        } else if (await page.locator(commentBox2).count() > 0) {
            await page.locator(commentBox2).first().click();
            await page.keyboard.type(content, { delay: 50 });
            await page.waitForTimeout(500);
             await page.keyboard.press('Tab');
             await page.keyboard.press('Enter');
            await page.waitForTimeout(2000);
            return { success: true };
        }

        return { success: false, error: 'Comment box not accessible' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleView(page, targetUrl, duration) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        
        const playBtn = '.ytp-large-play-button';
        if (await page.locator(playBtn).isVisible()) {
            await page.locator(playBtn).click();
        }
        
        const viewDuration = parseInt(duration) || 60000;
        
        await page.evaluate(() => {
            setInterval(() => {
                const video = document.querySelector('video');
                if (video && video.paused) {
                    video.play();
                }
            }, 5000);
        });

        await page.waitForTimeout(viewDuration);
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
                await page.goto('https://accounts.google.com/signup/v2/webcreateaccount?flowEntry=SignUp', { waitUntil: 'networkidle' });
                await page.waitForTimeout(1000);
                await page.locator('input[name="firstName"]').fill('John');
                await page.locator('input[name="lastName"]').fill('Doe');
                await page.locator('button:has-text("Next")').click();
                await page.waitForTimeout(2000);
                return true;
            },
            async () => {
                await page.goto('https://m.youtube.com/', { waitUntil: 'networkidle' });
                await page.locator('a[href*="signin"]').first().click();
                await page.waitForTimeout(2000);
                await page.locator('button:has-text("Create account")').click();
                await page.waitForTimeout(2000);
                return true;
            },
            async () => {
                await page.goto('https://myaccount.google.com/', { waitUntil: 'networkidle' });
                await page.locator('a[href*="signup"]').first().click();
                await page.waitForTimeout(2000);
                return true;
            }
        ];

        for (const method of methods) {
            try {
                const res = await method();
                if (res) {
                    success = true;
                    pAcc = {
                        username: `ytuser_${Math.random().toString(36).substring(7)}@gmail.com`,
                        password: `YtPass!${Math.random().toString(36).substring(7)}`,
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

        return { success: false, error: 'All creation methods failed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = {
    executeAction
};
