const browserManager = require('../core/browser');
const fs = require('fs');
const path = require('path');

// ============================================================
// TWITTER (X) PLATFORM MODULE
// Supports: create-account, follow, like, retweet, comment/reply
// Twitter heavily relies on [data-testid] selectors which are stable
// ============================================================

async function executeAction(action, account, task, proxy, paths) {
    const { browser, context } = await browserManager.launchBrowser(proxy, task.headless);
    
    try {
        const page = await context.newPage();

        if (action === 'create-account') {
            return await handleCreateAccount(page, task, paths, proxy);
        }

        const loggedIn = await login(page, account, paths);
        if (!loggedIn) {
            return { success: false, error: 'Twitter/X authorization failed. Session expired or locked out.' };
        }

        switch (action) {
            case 'follow': return await handleFollow(page, task.targetUrl || task.target);
            case 'like': return await handleLike(page, task.targetUrl);
            case 'retweet': return await handleRetweet(page, task.targetUrl);
            case 'comment': return await handleReply(page, task.targetUrl, task.content || 'Great post!');
            case 'view': return await handleView(page, task.targetUrl, task.duration);
            default: return { success: false, error: `Action '${action}' not supported on Twitter.` };
        }
    } catch (e) {
        return { success: false, error: `Critical Twitter error: ${e.message}` };
    } finally {
        await browser.close();
    }
}

// ============================================================
// LOGIN — Session cookie restore (X blocks raw login heavily)
// ============================================================
async function login(page, account, paths) {
    try {
        const sessionPath = path.join(paths.SESSIONS_PATH, `tw_${account.id}.json`);
        
        // STEP 1: Restore session (Primary approach for Twitter automation)
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            await page.goto('https://x.com/home', { waitUntil: 'load' });
            await page.waitForTimeout(3000 + Math.random() * 2000);
            
            // Look for indicators of being logged in (Account switcher, Compose pill)
            const pfpLocator = await page.locator('[data-testid="SideNav_AccountSwitcher_Button"], a[href="/compose/tweet"]').count();
            if (pfpLocator > 0) return true;
        }

        // STEP 2: Credential login (Secondary approach — risky)
        await page.goto('https://x.com/i/flow/login', { waitUntil: 'load' });
        await page.waitForTimeout(3000 + Math.random() * 2000);
        
        const usernameInput = await page.locator('input[autocomplete="username"]');
        if (await usernameInput.count() > 0 && await usernameInput.first().isVisible()) {
            await usernameInput.first().fill(account.username || account.email);
            // Click next
            await page.locator('button:has-text("Next"), div[role="button"]:has-text("Next")').click();
            await page.waitForTimeout(2000);
            
            const passInput = await page.locator('input[autocomplete="current-password"]');
            if (await passInput.count() > 0) {
                await passInput.first().fill(account.password);
                await page.locator('[data-testid="LoginForm_Login_Button"]').click();
                await page.waitForTimeout(5000);
            }
        }

        // Handle possible email verification challenge or locked alert
        const url = await page.url();
        if (url.includes('locked') || url.includes('challenge')) {
            return false;
        }

        const finalCheck = await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').count();
        if (finalCheck > 0) {
            const cookies = await page.context().cookies();
            try { fs.writeFileSync(sessionPath, JSON.stringify(cookies)); } catch (e) {}
            return true;
        }
        
        return false;
    } catch (e) {
        return false;
    }
}

// ============================================================
// FOLLOW — Follow a Twitter profile
// ============================================================
async function handleFollow(page, targetUrl) {
    try {
        let cleanUrl = targetUrl;
        if (!cleanUrl.includes('x.com/') && !cleanUrl.includes('twitter.com/')) {
            cleanUrl = `https://x.com/${targetUrl.replace('@', '')}`;
        }
        
        await page.goto(cleanUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 2000);
        
        // Twitter follows are easy via data-testid
        // The pattern is: [data-testid="<user_id>-follow"]
        // As a generic fallback, we select buttons ending with "-follow"
        const followBtn = await page.locator('div[data-testid$="-follow"]');
        if (await followBtn.count() > 0) {
            await followBtn.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }
        
        // Check if already following
        const unfollowBtn = await page.locator('div[data-testid$="-unfollow"]');
        if (await unfollowBtn.count() > 0) {
            return { success: true, message: 'Already following this account' };
        }
        
        // Wait, maybe the account is suspended or doesn't exist
        const errorState = await page.locator('[data-testid="emptyState"]').count();
        if (errorState > 0) {
            return { success: false, error: 'Account suspended or does not exist' };
        }
        
        return { success: false, error: 'Follow button not accessible on this profile layout' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// LIKE — Like a specific tweet
// ============================================================
async function handleLike(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 2000);
        
        // Main action comes under the Tweet box. ID is always "like"
        const likeBtn = await page.locator('[data-testid="like"]');
        if (await likeBtn.count() > 0) {
            // Pick the first one (which corresponds to the main tweet view, not replies)
            await likeBtn.first().click();
            await page.waitForTimeout(1500);
            return { success: true };
        }
        
        const unlikeBtn = await page.locator('[data-testid="unlike"]');
        if (await unlikeBtn.count() > 0) {
            return { success: true, message: 'Already liked this post' };
        }
        
        return { success: false, error: 'Like element not found — tweet may have been deleted' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// RETWEET (REPOST) — Retweet a specific tweet
// ============================================================
async function handleRetweet(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 2000);
        
        // Repost button
        const rtBtn = await page.locator('[data-testid="retweet"]');
        if (await rtBtn.count() > 0) {
            await rtBtn.first().click();
            await page.waitForTimeout(1000);
            
            // Secondary dropdown click
            const rtConfirm = await page.locator('[data-testid="retweetConfirm"]');
            if(await rtConfirm.count() > 0) {
                await rtConfirm.first().click();
                await page.waitForTimeout(1500);
                return { success: true };
            }
        }
        
        // Check if already reposted
        const unrtBtn = await page.locator('[data-testid="unretweet"]');
        if (await unrtBtn.count() > 0) {
            return { success: true, message: 'Already reposted this tweet' };
        }
        
        return { success: false, error: 'Repost element not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// REPLY/COMMENT — Reply to a tweet
// ============================================================
async function handleReply(page, targetUrl, content) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(3000 + Math.random() * 1000);
        
        // Focus the reply input
        const replyInput = await page.locator('.public-DraftEditor-content');
        if (await replyInput.count() > 0) {
            await replyInput.first().click();
            await page.waitForTimeout(500);
            
            // Type with delay
            await page.keyboard.type(content, { delay: 30 + Math.random() * 40 });
            await page.waitForTimeout(1000);
            
            // Click Tweet/Reply button
            // Usually has data-testid="tweetButtonInline" or "tweetButton"
            const sendBtn = await page.locator('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]');
            if (await sendBtn.count() > 0) {
                await sendBtn.first().click();
                await page.waitForTimeout(3000);
                return { success: true };
            }
            
            // Fallback: command + enter (mac) or ctrl + enter (win)
            // await page.keyboard.press('Control+Enter');
        }
        
        return { success: false, error: 'Reply Draft editor not found on the page' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// VIEW — Boost view count / impression
// ============================================================
async function handleView(page, targetUrl, duration) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1000);
        
        const viewDuration = parseInt(duration) || 15000;
        
        // Scroll slightly
        for (let i = 0; i < 2; i++) {
            await page.evaluate(() => window.scrollBy(0, 300));
            await page.waitForTimeout(3000 + Math.random() * 1000);
        }
        
        await page.waitForTimeout(viewDuration);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// CREATE ACCOUNT — Twitter signup (Very strict anti-bot)
// ============================================================
async function handleCreateAccount(page, task, paths, proxy) {
    try {
        let success = false;
        let pAcc = null;

        const methods = [
            async () => {
                await page.goto('https://x.com/i/flow/signup', { waitUntil: 'load' });
                await page.waitForTimeout(4000 + Math.random() * 2000);
                
                // Name field
                const nameInput = await page.locator('input[autocomplete="name"]');
                if (await nameInput.count() === 0) return null;
                
                const names = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Casey', 'Riley'];
                const randName = `${names[Math.floor(Math.random() * names.length)]} ${Math.floor(Math.random() * 9999)}`;
                await nameInput.first().fill(randName);
                await page.waitForTimeout(800 + Math.random() * 500);
                
                // Switch to email toggle (X defaults to phone numbers)
                const emailToggle = await page.locator('div[role="button"]:has-text("Use email instead"), div[role="button"]:has-text("email")');
                if (await emailToggle.count() > 0) {
                    await emailToggle.first().click();
                    await page.waitForTimeout(1000);
                }
                
                // Email field
                const emailInput = await page.locator('input[autocomplete="email"], input[type="email"]');
                const eml = `tw_${Math.random().toString(36).substring(2, 10)}@example.com`;
                
                if (await emailInput.count() > 0) {
                    await emailInput.first().fill(eml);
                    await page.waitForTimeout(1000);
                } else {
                    return null; // Phone verify needed
                }
                
                // Birthday selects
                const monthSel = await page.locator('select#SELECTOR_1, select[aria-label*="Month" i]');
                if (await monthSel.count() > 0) {
                    await monthSel.first().selectOption({ index: 3 }); // March
                    await page.locator('select#SELECTOR_2, select[aria-label*="Day" i]').selectOption({ index: 15 });
                    
                    // Pick a year between 1990 and 2000
                    const yearIdx = Math.floor(Math.random() * 10) + 24; 
                    await page.locator('select#SELECTOR_3, select[aria-label*="Year" i]').selectOption({ index: yearIdx });
                }
                
                // Click Next
                await page.locator('div[role="button"]:has-text("Next")').click();
                await page.waitForTimeout(3000);
                
                // Track consent page -> Next
                if (await page.locator('div[role="button"]:has-text("Next")').count() > 0) {
                    await page.locator('div[role="button"]:has-text("Next")').click();
                    await page.waitForTimeout(3000);
                }
                
                // Sign up confirmation button
                const signupBtn = await page.locator('div[role="button"]:has-text("Sign up")');
                if (await signupBtn.count() > 0) {
                    await signupBtn.click();
                    await page.waitForTimeout(5000);
                }
                
                let isArkose = await page.locator('iframe[src*="arkoselabs"]').count() > 0;
                if (isArkose) {
                    const captchaSolver = require('../core/captcha-solver');
                    const solveRes = await captchaSolver.solvePlaywrightVisual(page);
                    if (solveRes.success) isArkose = false;
                }
                
                return { 
                    email: eml, 
                    password: `TwPass!${Math.random().toString(36).substring(2, 10)}`,
                    name: randName,
                    captchaTriggered: isArkose
                };
            }
        ];

        for (let i = 0; i < methods.length; i++) {
            try {
                const res = await methods[i]();
                if (res) {
                    success = true;
                    pAcc = {
                        username: res.email.split('@')[0],
                        email: res.email,
                        password: res.password,
                        platform: 'twitter',
                        captchaTriggered: res.captchaTriggered || false,
                        createdAt: new Date().toISOString()
                    };
                    break;
                }
            } catch (err) { continue; }
        }

        if (success) return { success: true, account: pAcc };
        return { success: false, error: 'X account creation blocked' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = { executeAction };
