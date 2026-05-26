const browserManager = require('../core/browser');
const fs = require('fs');
const path = require('path');

// ============================================================
// FACEBOOK PLATFORM MODULE
// Supports: create-account, follow, like, comment
// Facebook changes classes often, relying on aria-labels and roles
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
            return { success: false, error: 'Facebook authorization failed' };
        }

        switch (action) {
            case 'follow': return await handleFollow(page, task.targetUrl || task.target);
            case 'like': return await handleLike(page, task.targetUrl);
            case 'comment': return await handleComment(page, task.targetUrl, task.content || 'Great post!');
            default: return { success: false, error: `Action '${action}' not supported on Facebook.` };
        }
    } catch (e) {
        return { success: false, error: `Critical Facebook error: ${e.message}` };
    } finally {
        await browser.close();
    }
}

// ============================================================
// LOGIN — Session cookie restore + Credential fallback
// ============================================================
async function login(page, account, paths) {
    try {
        const sessionPath = path.join(paths.SESSIONS_PATH, `fb_${account.id}.json`);
        
        // STEP 1: Restore session
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            await page.goto('https://www.facebook.com/', { waitUntil: 'load' });
            await page.waitForTimeout(3000 + Math.random() * 2000);
            
            // Check for logged in indicators
            const isLoggedIn = await page.locator('svg[aria-label="Your profile"], svg[aria-label="Твой профиль"], a[aria-label="Facebook"], div[role="navigation"]').count();
            if (isLoggedIn > 0) return true;
        }

        // STEP 2: Credential login
        await page.goto('https://www.facebook.com/login', { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1000);
        
        const emailInput = await page.locator('input[name="email"], input#email');
        const passInput = await page.locator('input[name="pass"], input#pass');
        
        if (await emailInput.count() > 0 && await passInput.count() > 0) {
            await emailInput.first().fill(account.email || account.username || account.phone);
            await page.waitForTimeout(500 + Math.random() * 500);
            await passInput.first().fill(account.password);
            await page.waitForTimeout(500 + Math.random() * 500);
            
            const loginBtn = await page.locator('button[name="login"], #loginbutton');
            if (await loginBtn.count() > 0) {
                await loginBtn.first().click();
                await page.waitForTimeout(5000);
            }
        }

        // Check for 2FA or security check
        const checkpoint = await page.url();
        if (checkpoint.includes('checkpoint') || checkpoint.includes('challenge')) {
            return false;
        }

        // Final Verify
        const finalCheck = await page.locator('svg[aria-label="Your profile"], div[role="navigation"]').count();
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
// FOLLOW / ADD FRIEND — Handle both pages and user profiles
// ============================================================
async function handleFollow(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 2000);
        
        // Multi-language approach: check aria-labels for follow/add actions
        const actionSelectors = [
            'div[aria-label="Follow"]',
            'div[aria-label="Add Friend"]',
            'div[aria-label="Подписаться"]',
            'div[aria-label="Добавить в друзья"]',
            'div[aria-label="Kuzatish"]',
            'span:has-text("Follow")',
            'span:has-text("Add Friend")'
        ];
        
        for (const selector of actionSelectors) {
            const btn = await page.locator(selector).first();
            // Facebook buttons often have dive inside them, we need a clickable role="button" or the div itself
            if (await page.locator(`${selector}[role="button"]`).count() > 0) {
                await page.locator(`${selector}[role="button"]`).first().click();
                await page.waitForTimeout(2000);
                return { success: true };
            } else if (await btn.count() > 0 && await btn.isVisible()) {
                await btn.click();
                await page.waitForTimeout(2000);
                return { success: true };
            }
        }
        
        // Check if already following / friends
        const followingIndicators = [
            'div[aria-label="Following"]',
            'div[aria-label="Friends"]',
            'div[aria-label="Requested"]',
            'div[aria-label="Вы подписаны"]',
            'div[aria-label="Друзья"]'
        ];
        
        for (const ind of followingIndicators) {
            if (await page.locator(ind).count() > 0) {
                return { success: true, message: 'Already following, friends, or requested' };
            }
        }
        
        return { success: false, error: 'Follow/Add element not found — layout changed or access restricted' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// LIKE — Click like on a specific post
// ============================================================
async function handleLike(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(3000 + Math.random() * 2000);
        
        // Ensure we find the Like button for the main post, usually the first one with aria-label="Like"
        const likeSelectors = [
            'div[aria-label="Like"][role="button"]',
            'div[aria-label="Нравится"][role="button"]',
            'div[aria-label="Yoqdi"][role="button"]',
            'span:has-text("Like")'
        ];
        
        for (const selector of likeSelectors) {
            const likeBtn = await page.locator(selector);
            if (await likeBtn.count() > 0) {
                // To avoid clicking comment likes, ensure we target the main post action bar
                // Usually it's the first visible one
                await likeBtn.first().click();
                await page.waitForTimeout(1500);
                return { success: true };
            }
        }
        
        // Check if already liked
        const unlikeSelectors = [
            'div[aria-label="Remove Like"]',
            'div[aria-label="Убрать отметку \\"Нравится\\""]',
            'div[aria-label="Like"][aria-pressed="true"]'
        ];
        
        for (const selector of unlikeSelectors) {
            if (await page.locator(selector).count() > 0) {
                return { success: true, message: 'Already liked' };
            }
        }
        
        return { success: false, error: 'Like element not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// COMMENT — Write a comment on a Post
// ============================================================
async function handleComment(page, targetUrl, content) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(3000 + Math.random() * 1000);
        
        // Facebook uses draft-js / lexical editor for comments
        const commentBoxSelectors = [
            'div[aria-label*="Write a comment"]',
            'div[aria-label*="Написать комментарий"]',
            'div[data-lexical-editor="true"]',
            'div[role="textbox"][aria-label*="comment" i]',
            'div[role="textbox"]'
        ];
        
        let found = false;
        for (const selector of commentBoxSelectors) {
            const inputBox = await page.locator(selector);
            if (await inputBox.count() > 0) {
                await inputBox.first().click();
                await page.waitForTimeout(500);
                
                // Type character by character
                await page.keyboard.type(content, { delay: 30 + Math.random() * 40 });
                await page.waitForTimeout(1000 + Math.random() * 500);
                
                // Press enter to post
                await page.keyboard.press('Enter');
                await page.waitForTimeout(2000);
                
                found = true;
                return { success: true };
            }
        }
        
        return { success: false, error: 'Comment box not accessible' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// CREATE ACCOUNT — Facebook registration flow
// ============================================================
async function handleCreateAccount(page, task, paths, proxy) {
    try {
        let success = false;
        let pAcc = null;

        const methods = [
            // METHOD 1: Mobile registration (usually simpler, fewer blockades)
            async () => {
                await page.setExtraHTTPHeaders({
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36'
                });
                
                await page.goto('https://m.facebook.com/reg/', { waitUntil: 'load' });
                await page.waitForTimeout(3000 + Math.random() * 2000);
                
                const fnInput = await page.locator('input[name="firstname"]');
                if (await fnInput.count() === 0) return null;
                
                const firstName = ['John', 'David', 'Michael', 'Chris', 'James'][Math.floor(Math.random() * 5)];
                const lastName = ['Smith', 'Doe', 'Brown', 'Davis', 'Wilson'][Math.floor(Math.random() * 5)];
                
                await fnInput.first().fill(firstName);
                await page.locator('input[name="lastname"]').fill(lastName);
                await page.waitForTimeout(500);
                
                const nextBtn1 = await page.locator('button[value="Next"], input[value="Next"]');
                if (await nextBtn1.count() > 0) {
                    await nextBtn1.first().click();
                    await page.waitForTimeout(2000);
                }
                
                // DOB
                const dobDay = await page.locator('select#day');
                if (await dobDay.count() > 0) {
                    await dobDay.selectOption('15');
                    await page.locator('select#month').selectOption('1');
                    await page.locator('select#year').selectOption('2000');
                    await page.locator('button:has-text("Next")').click();
                    await page.waitForTimeout(2000);
                }
                
                // Email instead of phone
                const emailBtn = await page.locator('a:has-text("Sign up with email")');
                if (await emailBtn.count() > 0) {
                    await emailBtn.click();
                    await page.waitForTimeout(1000);
                }
                
                const emailInput = await page.locator('input[name="reg_email__"]');
                const eml = `fb_${Math.random().toString(36).substring(2, 10)}@example.com`;
                
                if (await emailInput.count() > 0) {
                    await emailInput.fill(eml);
                    await page.locator('button:has-text("Next")').click();
                    await page.waitForTimeout(2000);
                }
                
                // Gender
                const genderMale = await page.locator('input[value="2"], span:has-text("Male")');
                if (await genderMale.count() > 0) {
                    await genderMale.first().click();
                    await page.locator('button:has-text("Next")').click();
                    await page.waitForTimeout(2000);
                }
                
                // Password
                const passInput = await page.locator('input[name="reg_passwd__"]');
                const pass = `FbPass!${Math.random().toString(36).substring(2, 10)}`;
                
                if (await passInput.count() > 0) {
                    await passInput.fill(pass);
                    await page.locator('button[name="submit"]').click();
                    await page.waitForTimeout(5000);
                    
                    return { email: eml, password: pass, firstName, lastName };
                }
                
                return null;
            },
            
            // METHOD 2: Desktop registration
            async () => {
                await page.goto('https://www.facebook.com/r.php', { waitUntil: 'load' });
                await page.waitForTimeout(3000 + Math.random() * 2000);
                
                const fnInput = await page.locator('input[name="firstname"]');
                if (await fnInput.count() > 0) {
                    const firstName = 'Alex';
                    const lastName = 'Taylor';
                    const eml = `fb_${Math.random().toString(36).substring(2, 10)}@example.com`;
                    const pass = `FbPass!${Math.random().toString(36).substring(2, 10)}`;
                    
                    await fnInput.first().fill(firstName);
                    await page.locator('input[name="lastname"]').fill(lastName);
                    
                    await page.locator('input[name="reg_email__"]').fill(eml);
                    await page.waitForTimeout(500);
                    
                    // Trigger confirmation email field
                    const conf = await page.locator('input[name="reg_email_confirmation__"]');
                    if (await conf.count() > 0 && await conf.isVisible()) {
                        await conf.fill(eml);
                    }
                    
                    await page.locator('input[name="reg_passwd__"]').fill(pass);
                    
                    // DOB
                    if (await page.locator('select#day').count() > 0) {
                        await page.locator('select#day').selectOption('15');
                        await page.locator('select#month').selectOption('1');
                        await page.locator('select#year').selectOption('1998');
                    }
                    
                    // Gender (2 = Male, 1 = Female, 3 = Custom on FB)
                    await page.locator('input[name="sex"][value="2"]').click();
                    
                    // Submit
                    await page.locator('button[name="websubmit"]').click();
                    await page.waitForTimeout(6000);
                    
                    return { email: eml, password: pass, firstName, lastName };
                }
                return null;
            }
        ];

        for (let i = 0; i < methods.length; i++) {
            try {
                const res = await methods[i]();
                if (res) {
                    success = true;
                    pAcc = {
                        username: `${res.firstName.toLowerCase()}${res.lastName.toLowerCase()}${Math.floor(Math.random() * 9999)}`,
                        email: res.email,
                        password: res.password,
                        firstName: res.firstName,
                        lastName: res.lastName,
                        platform: 'facebook',
                        createdAt: new Date().toISOString()
                    };
                    break;
                }
            } catch (err) {
                continue;
            }
        }

        if (success) return { success: true, account: pAcc };
        return { success: false, error: 'Facebook account creation blocked by security checkpoint / IP block' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = { executeAction };
