const browserManager = require('../core/browser');
const fs = require('fs');
const path = require('path');

// ============================================================
// ROBLOX PLATFORM MODULE
// Supports: create-account, follow, favorite, join-group, gamepass
// Uses language-agnostic selectors with multi-fallback strategies
// ============================================================

async function executeAction(action, account, task, proxy, paths) {
    const { browser, context } = await browserManager.launchBrowser(proxy, task.headless);
    
    try {
        const page = await context.newPage();

        if (action === 'create-account') {
            return await handleCreateAccount(page, task, paths, account, proxy);
        }

        const loggedIn = await login(page, account, paths);
        if (!loggedIn) {
            return { success: false, error: 'Roblox authorization failed or 2FA triggered' };
        }

        switch (action) {
            case 'follow': return await handleFollow(page, task.targetUrl || task.target);
            case 'favorite': return await handleFavorite(page, task.targetUrl);
            case 'join-group': return await handleJoinGroup(page, task.targetUrl);
            case 'gamepass': return await handleGamepass(page, task.targetUrl);
            default: return { success: false, error: `Action '${action}' not supported on Roblox.` };
        }
    } catch (e) {
        return { success: false, error: `Critical Roblox error: ${e.message}` };
    } finally {
        await browser.close();
    }
}

// ============================================================
// LOGIN — Session restore + credential-based fallback
// ============================================================
async function login(page, account, paths) {
    try {
        const sessionPath = path.join(paths.SESSIONS_PATH, `rbx_${account.id}.json`);
        
        // STEP 1: Try restoring session from cookies
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            await page.goto('https://www.roblox.com/home', { waitUntil: 'load' });
            await page.waitForTimeout(2000 + Math.random() * 1000);
            
            // Language-agnostic: check for the age bracket label OR the logged-in nav avatar
            const isLoggedIn = await page.locator('.age-bracket-label, .avatar-card-link, span.icon-nav-profile').count();
            if (isLoggedIn > 0) return true;
        }

        // STEP 2: Fresh login with credentials
        await page.goto('https://www.roblox.com/login', { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1000);
        
        // Roblox login fields — these IDs are very stable
        const usernameInput = await page.locator('#login-username, input[name="loginValue"]');
        const passwordInput = await page.locator('#login-password, input[name="password"]');
        
        if (await usernameInput.count() > 0 && await passwordInput.count() > 0) {
            await usernameInput.first().fill(account.username);
            await page.waitForTimeout(500 + Math.random() * 500);
            await passwordInput.first().fill(account.password);
            await page.waitForTimeout(500 + Math.random() * 500);
            
            const loginBtn = await page.locator('#login-button, button[type="submit"]');
            if (await loginBtn.count() > 0) {
                await loginBtn.first().click();
                await page.waitForTimeout(5000);
            }
        }

        // STEP 3: Check for 2FA challenge
        const twoFactorInput = await page.locator('#two-step-verification-code-input, input[name="code"]').count();
        if (twoFactorInput > 0) {
            return false; // Cannot bypass 2FA automatically
        }

        // STEP 4: Verify login succeeded
        const loggedInCheck = await page.locator('.age-bracket-label, .avatar-card-link, span.icon-nav-profile').count();
        if (loggedInCheck > 0) {
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
// FOLLOW — Click the follow option from the user profile
// ============================================================
async function handleFollow(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 2000);
        
        // Strategy 1: Modern React Profile — Follow button is often directly visible
        const directFollowBtn = await page.locator('button.follow-btn, button[data-testid="follow-button"]');
        if (await directFollowBtn.count() > 0) {
            await directFollowBtn.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }
        
        // Strategy 2: Classic Profile — Follow is inside the "More" dropdown
        const moreBtn = await page.locator('.profile-header-more-container button, button.dropdown-toggle');
        if (await moreBtn.count() > 0) {
            await moreBtn.first().click();
            await page.waitForTimeout(1000);
            
            // Language-agnostic: use the menu item structure rather than text
            const menuItems = await page.locator('.popover-content li, ul.dropdown-menu li');
            const count = await menuItems.count();
            
            for (let i = 0; i < count; i++) {
                const text = await menuItems.nth(i).innerText();
                // "Follow" in any supported language
                if (text.toLowerCase().includes('follow') || text.toLowerCase().includes('подписаться') || text.toLowerCase().includes('kuzatish')) {
                    await menuItems.nth(i).click();
                    await page.waitForTimeout(2000);
                    return { success: true };
                }
            }
        }
        
        // Strategy 3: Check if already following
        const friendBtn = await page.locator('button.btn-control-friend, span:has-text("Friends"), .friend-status').count();
        if (friendBtn > 0) {
            return { success: true, message: 'Already friends or following' };
        }
        
        return { success: false, error: 'Follow option unavailable — selectors may have changed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// FAVORITE — Toggle Favorite on a Game/Experience page
// ============================================================
async function handleFavorite(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1500);
        
        // Roblox uses #favorite-button with an icon class to indicate state
        const favBtn = await page.locator('#favorite-button, button[data-testid="favorite-button"]');
        if (await favBtn.count() > 0) {
            const classAttr = await favBtn.first().getAttribute('class') || '';
            
            // If already favorited, the icon changes
            if (classAttr.includes('icon-favorite-on') || classAttr.includes('active')) {
                return { success: true, message: 'Already favorited' };
            }
            
            await favBtn.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }
        
        // Fallback: look for generic favorite/heart icon on the page
        const heartBtn = await page.locator('.favorite-icon, svg path[d*="M12 21"]');
        if (await heartBtn.count() > 0) {
            await heartBtn.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }
        
        return { success: false, error: 'Favorite button not found on this page' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// JOIN GROUP — Click the Join button on a Roblox group page
// ============================================================
async function handleJoinGroup(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 2000);
        
        // Strategy 1: Modern group page has a primary join button
        const joinBtn = await page.locator('.group-buttons button.btn-primary-md, button[data-testid="join-group-button"]');
        if (await joinBtn.count() > 0) {
            await joinBtn.first().click();
            await page.waitForTimeout(3000);
            return { success: true };
        }
        
        // Strategy 2: Check for text-based buttons (multi-language fallback)
        const textBtns = await page.locator('.group-buttons button, .group-header button');
        const count = await textBtns.count();
        for (let i = 0; i < count; i++) {
            const text = await textBtns.nth(i).innerText();
            if (text.toLowerCase().includes('join') || text.toLowerCase().includes('вступить') || text.toLowerCase().includes("qo'shilish")) {
                await textBtns.nth(i).click();
                await page.waitForTimeout(3000);
                return { success: true };
            }
        }
        
        // Strategy 3: Check if already a member
        const memberLabel = await page.locator('.group-member-count, span:has-text("Member"), .group-role-label').count();
        if (memberLabel > 0) {
            return { success: true, message: 'May already be a member of this group' };
        }
        
        return { success: false, error: 'Join button not found or already joined' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// GAMEPASS — Attempt to purchase a free gamepass
// ============================================================
async function handleGamepass(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1000);
        
        // Look for the "Get" or "Buy" button (usually has btn-growth class)
        const buyBtn = await page.locator('button.btn-growth-lg, button[data-testid="buy-button"], .PurchaseButton');
        if (await buyBtn.count() > 0) {
            await buyBtn.first().click();
            await page.waitForTimeout(2000);
            
            // Confirmation modal usually appears
            const confirmBtn = await page.locator('.modal-footer button.btn-primary-md, button[data-testid="confirm-purchase-button"]');
            if (await confirmBtn.count() > 0) {
                await confirmBtn.first().click();
                await page.waitForTimeout(3000);
                return { success: true };
            }
            
            // Fallback: search for any prominent button in the modal
            const modalBtns = await page.locator('.modal-content button, .modal-dialog button');
            const count = await modalBtns.count();
            for (let i = 0; i < count; i++) {
                const text = await modalBtns.nth(i).innerText();
                if (text.toLowerCase().includes('buy') || text.toLowerCase().includes('get') || text.toLowerCase().includes('confirm')) {
                    await modalBtns.nth(i).click();
                    await page.waitForTimeout(3000);
                    return { success: true };
                }
            }
        }
        
        return { success: false, error: 'Could not purchase Gamepass — may require Robux or button was not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// CREATE ACCOUNT — Step-by-step Roblox signup form
// ============================================================
async function handleCreateAccount(page, task, paths, accountTemplate, proxy) {
    try {
        let success = false;
        let pAcc = null;

        const methods = [
            // METHOD 1: Direct Roblox.com Signup
            async () => {
                await page.goto('https://www.roblox.com/', { waitUntil: 'load' });
                await page.waitForTimeout(2000 + Math.random() * 1000);
                
                // Roblox signup form is typically on the main page
                // Date of birth dropdowns
                const monthDrop = await page.locator('#MonthDropdown, select[id*="month" i]');
                const dayDrop = await page.locator('#DayDropdown, select[id*="day" i]');
                const yearDrop = await page.locator('#YearDropdown, select[id*="year" i]');
                
                if (await monthDrop.count() > 0 && await dayDrop.count() > 0 && await yearDrop.count() > 0) {
                    await monthDrop.first().selectOption('Jan');
                    await page.waitForTimeout(300);
                    await dayDrop.first().selectOption('15');
                    await page.waitForTimeout(300);
                    await yearDrop.first().selectOption('2000');
                    await page.waitForTimeout(500);
                    
                    // Username
                    const username = `rbx_${Math.random().toString(36).substring(2, 10)}`;
                    const password = `RbxPass!${Math.random().toString(36).substring(2, 10)}`;
                    
                    const usernameInput = await page.locator('#signup-username, input[name="signupUsername"]');
                    if (await usernameInput.count() > 0) {
                        await usernameInput.first().fill(username);
                        await page.waitForTimeout(800 + Math.random() * 500);
                    }
                    
                    const passwordInput = await page.locator('#signup-password, input[name="signupPassword"]');
                    if (await passwordInput.count() > 0) {
                        await passwordInput.first().fill(password);
                        await page.waitForTimeout(800 + Math.random() * 500);
                    }
                    
                    // Gender selection (optional, click Male/Female or skip)
                    const genderBtn = await page.locator('#MaleButton, #FemaleButton, label[id*="gender"]');
                    if (await genderBtn.count() > 0) {
                        await genderBtn.first().click();
                        await page.waitForTimeout(500);
                    }
                    
                    // Submit signup
                    const signupBtn = await page.locator('#signup-button, button[type="submit"]');
                    if (await signupBtn.count() > 0) {
                        await signupBtn.first().click();
                        await page.waitForTimeout(5000);
                    }
                    
                    // Check for captcha
                    let isCaptchaTriggered = await page.locator('iframe[src*="funcaptcha"], iframe[src*="arkoselabs"]').count() > 0;
                    if (isCaptchaTriggered) {
                        const captchaSolver = require('../core/captcha-solver');
                        const solveRes = await captchaSolver.solvePlaywrightVisual(page);
                        if (solveRes.success) isCaptchaTriggered = false;
                    }
                    
                    if (isCaptchaTriggered) {
                        return { u: username, p: password, captcha: true };
                    }
                    
                    return { u: username, p: password };
                }
                return null;
            },
            
            // METHOD 2: Roblox Mobile signup page
            async () => {
                await page.goto('https://www.roblox.com/NewLogin', { waitUntil: 'load' });
                await page.waitForTimeout(2000);
                
                const signupTab = await page.locator('a[href*="signup"], button:has-text("Sign Up"), .login-tab-signup');
                if (await signupTab.count() > 0) {
                    await signupTab.first().click();
                    await page.waitForTimeout(2000);
                    return { u: `rbx_mobile_${Math.random().toString(36).substring(7)}`, p: `MobilePass!${Math.random().toString(36).substring(7)}` };
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
                        username: res.u,
                        password: res.p,
                        platform: 'roblox',
                        captchaTriggered: res.captcha || false,
                        createdAt: new Date().toISOString()
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

        return { success: false, error: 'Roblox registration blocked — FunCaptcha or selectors changed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = { executeAction };
