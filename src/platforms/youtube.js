const browserManager = require('../core/browser');
const fs = require('fs');
const path = require('path');

// ============================================================
// YOUTUBE PLATFORM MODULE
// Supports: create-account, subscribe, like, dislike, comment, view
// Uses YouTube's custom element tag names (ytd-*) which are stable
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
            return { success: false, error: 'YouTube/Google authorization failed or bot detected' };
        }

        switch (action) {
            case 'subscribe': return await handleSubscribe(page, task.target || task.targetUrl);
            case 'like': return await handleLike(page, task.targetUrl);
            case 'dislike': return await handleDislike(page, task.targetUrl);
            case 'comment': return await handleComment(page, task.targetUrl, task.content || 'Great video!');
            case 'view': return await handleView(page, task.targetUrl, task.duration);
            default: return { success: false, error: `Action '${action}' not supported on YouTube.` };
        }
    } catch (e) {
        return { success: false, error: `Critical YouTube error: ${e.message}` };
    } finally {
        await browser.close();
    }
}

// ============================================================
// LOGIN — Session restore + Google sign-in with human delays
// ============================================================
async function login(page, account, paths) {
    try {
        const sessionPath = path.join(paths.SESSIONS_PATH, `yt_${account.id}.json`);
        
        // STEP 1: Try restoring session from saved cookies
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            await page.goto('https://m.youtube.com/', { waitUntil: 'load' });
            await page.waitForTimeout(2000 + Math.random() * 1000);
            
            // Check for avatar button (indicates logged in) — stable across all languages
            const isLoggedIn = await page.locator('#avatar-btn, button#avatar-btn, ytd-topbar-menu-button-renderer img.yt-img-shadow').count();
            if (isLoggedIn > 0) return true;
        }

        // STEP 2: Fresh Google sign-in for YouTube
        await page.goto('https://accounts.google.com/signin/v2/identifier?service=youtube&flowName=GlifWebSignIn&flowEntry=ServiceLogin', { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1000);
        
        // Email input — Google uses input[type="email"] consistently
        const emailInput = await page.locator('input[type="email"]');
        if (await emailInput.count() > 0 && await emailInput.first().isVisible()) {
            await emailInput.first().fill(account.email || account.username);
            await page.waitForTimeout(800 + Math.random() * 500);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(3000 + Math.random() * 2000);
            
            // Password input
            const passwordInput = await page.locator('input[type="password"]');
            if (await passwordInput.count() > 0 && await passwordInput.first().isVisible()) {
                await passwordInput.first().fill(account.password);
                await page.waitForTimeout(800 + Math.random() * 500);
                await page.keyboard.press('Enter');
                await page.waitForTimeout(4000 + Math.random() * 2000);
            }
        }

        // Check for 2FA or security challenge
        const challengeUrl = page.url();
        if (challengeUrl.includes('challenge') || challengeUrl.includes('signin/rejected')) {
            return false;
        }

        // Verify login on YouTube
        await page.goto('https://m.youtube.com/', { waitUntil: 'load' });
        await page.waitForTimeout(2000);
        
        const avatarCheck = await page.locator('#avatar-btn, button#avatar-btn').count();
        if (avatarCheck > 0) {
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
// SUBSCRIBE — Click subscribe on a YouTube channel
// ============================================================
async function handleSubscribe(page, targetUrl) {
    try {
        // Ensure it's a channel URL
        let cleanUrl = targetUrl;
        if (!cleanUrl.includes('youtube.com') && !cleanUrl.includes('youtu.be')) {
            cleanUrl = `https://www.youtube.com/${targetUrl}`;
        }
        
        await page.goto(cleanUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 2000);
        
        // Strategy 1: Modern ytd-subscribe-button-renderer (most common)
        const subBtnRenderers = [
            'ytd-subscribe-button-renderer button',
            '#subscribe-button ytd-subscribe-button-renderer button',
            '#subscribe-button button',
            'ytd-channel-renderer #subscribe-button button'
        ];
        
        for (const selector of subBtnRenderers) {
            const btn = await page.locator(selector);
            if (await btn.count() > 0) {
                // Check if already subscribed
                const ariaLabel = await btn.first().getAttribute('aria-label') || '';
                const subscribed = await btn.first().getAttribute('subscribed');
                
                if (subscribed !== null || ariaLabel.toLowerCase().includes('unsubscribe')) {
                    return { success: true, message: 'Already subscribed to this channel' };
                }
                
                await btn.first().click();
                await page.waitForTimeout(2000);
                return { success: true };
            }
        }
        
        // Strategy 2: Paper button fallback (older YouTube)
        const paperBtn = await page.locator('#subscribe-button paper-button, #subscribe-button yt-button-shape button');
        if (await paperBtn.count() > 0) {
            await paperBtn.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }
        
        return { success: false, error: 'Subscribe button not found — channel page may have changed layout' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// LIKE — Click the like button on a YouTube video
// ============================================================
async function handleLike(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 2000);
        
        // Scroll down slightly like a human to trigger lazy loading
        await page.evaluate(() => window.scrollBy(0, 200));
        await page.waitForTimeout(1000);
        
        // Strategy 1: Modern segmented like/dislike buttons (2024+ layout)
        const segmentedLike = await page.locator('like-button-view-model button, ytd-toggle-button-renderer#top-level-buttons-computed button:first-child, #segmented-like-button button');
        if (await segmentedLike.count() > 0) {
            const ariaPressed = await segmentedLike.first().getAttribute('aria-pressed');
            if (ariaPressed === 'true') {
                return { success: true, message: 'Already liked this video' };
            }
            await segmentedLike.first().click();
            await page.waitForTimeout(1500);
            return { success: true };
        }
        
        // Strategy 2: Classic toggle button renderers
        const classicLikeSelectors = [
            'ytd-menu-renderer ytd-toggle-button-renderer:nth-child(1) a',
            '.ytd-video-primary-info-renderer ytd-toggle-button-renderer:first-child',
            '#top-level-buttons-computed > ytd-toggle-button-renderer:nth-child(1)',
            'ytd-toggle-button-renderer button[aria-label*="like" i]'
        ];
        
        for (const selector of classicLikeSelectors) {
            const btn = await page.locator(selector);
            if (await btn.count() > 0) {
                const isPressed = await btn.first().getAttribute('aria-pressed');
                if (isPressed === 'true') {
                    return { success: true, message: 'Already liked this video' };
                }
                await btn.first().click();
                await page.waitForTimeout(1500);
                return { success: true };
            }
        }
        
        return { success: false, error: 'Like button not found — video page layout may have changed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// DISLIKE — Click the dislike button on a YouTube video
// ============================================================
async function handleDislike(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 2000);
        
        await page.evaluate(() => window.scrollBy(0, 200));
        await page.waitForTimeout(1000);
        
        // Strategy 1: Modern segmented dislike button
        const segmentedDislike = await page.locator('dislike-button-view-model button, #segmented-dislike-button button');
        if (await segmentedDislike.count() > 0) {
            const ariaPressed = await segmentedDislike.first().getAttribute('aria-pressed');
            if (ariaPressed === 'true') {
                return { success: true, message: 'Already disliked' };
            }
            await segmentedDislike.first().click();
            await page.waitForTimeout(1500);
            return { success: true };
        }
        
        // Strategy 2: Classic toggle button (2nd child in the like/dislike pair)
        const classicDislikeSelectors = [
            'ytd-menu-renderer ytd-toggle-button-renderer:nth-child(2) a',
            '#top-level-buttons-computed > ytd-toggle-button-renderer:nth-child(2)',
            'ytd-toggle-button-renderer button[aria-label*="dislike" i]'
        ];
        
        for (const selector of classicDislikeSelectors) {
            const btn = await page.locator(selector);
            if (await btn.count() > 0) {
                await btn.first().click();
                await page.waitForTimeout(1500);
                return { success: true };
            }
        }
        
        return { success: false, error: 'Dislike button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// COMMENT — Post a comment on a YouTube video
// ============================================================
async function handleComment(page, targetUrl, content) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1000);
        
        // Scroll down to load the comment section (YouTube lazy-loads comments)
        await page.evaluate(() => window.scrollBy(0, 600));
        await page.waitForTimeout(2000);
        await page.evaluate(() => window.scrollBy(0, 300));
        await page.waitForTimeout(2000);
        
        // Strategy 1: Click the comment placeholder box to activate the input
        const commentPlaceholder = await page.locator('#simplebox-placeholder, ytd-comment-simplebox-renderer #placeholder-area');
        if (await commentPlaceholder.count() > 0) {
            await commentPlaceholder.first().click();
            await page.waitForTimeout(1000);
            
            // Type into the contenteditable div
            const editableBox = await page.locator('#contenteditable-root, div[contenteditable="true"]');
            if (await editableBox.count() > 0) {
                await editableBox.first().click();
                await page.keyboard.type(content, { delay: 30 + Math.random() * 40 });
                await page.waitForTimeout(1000 + Math.random() * 500);
                
                // Click the submit button
                const submitBtn = await page.locator('#submit-button, ytd-button-renderer#submit-button button');
                if (await submitBtn.count() > 0) {
                    await submitBtn.first().click();
                    await page.waitForTimeout(3000);
                    return { success: true };
                }
            }
        }
        
        // Strategy 2: Direct contenteditable fallback
        const directEditable = await page.locator('ytd-comment-simplebox-renderer div[contenteditable="true"]');
        if (await directEditable.count() > 0) {
            await directEditable.first().click();
            await page.keyboard.type(content, { delay: 30 + Math.random() * 40 });
            await page.waitForTimeout(1000);
            
            // Try Tab + Enter as submit fallback
            await page.keyboard.press('Tab');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(3000);
            return { success: true };
        }

        return { success: false, error: 'Comment box not accessible — may require login or comments are disabled' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// VIEW — Watch a video for a specified duration (view count boost)
// ============================================================
async function handleView(page, targetUrl, duration) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1000);
        
        // Click the large play button if video isn't auto-playing
        const playBtn = await page.locator('.ytp-large-play-button, button.ytp-play-button');
        try {
            if (await playBtn.count() > 0 && await playBtn.first().isVisible()) {
                await playBtn.first().click();
                await page.waitForTimeout(1000);
            }
        } catch (e) {
            // Play button may not be visible if autoplay is on, that's fine
        }
        
        const viewDuration = parseInt(duration) || 60000;
        
        // Inject a script to keep the video playing (handles random pauses)
        await page.evaluate(() => {
            const keepAlive = setInterval(() => {
                const video = document.querySelector('video');
                if (video && video.paused) {
                    video.play().catch(() => {});
                }
                // Dismiss any popups/overlays
                const dismissBtns = document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-container button, [data-testid="dismiss-button"]');
                dismissBtns.forEach(btn => { try { btn.click(); } catch (e) {} });
            }, 5000);
            
            // Store the interval ID for cleanup
            window.__smmKeepAlive = keepAlive;
        });

        // Simulate occasional human mouse movements during viewing
        const scrollInterval = setInterval(async () => {
            try {
                await page.mouse.move(
                    300 + Math.random() * 400,
                    200 + Math.random() * 300
                );
            } catch (e) {}
        }, 20000);

        await page.waitForTimeout(viewDuration);
        
        clearInterval(scrollInterval);
        
        // Clean up the keep-alive script
        await page.evaluate(() => {
            if (window.__smmKeepAlive) clearInterval(window.__smmKeepAlive);
        }).catch(() => {});
        
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// CREATE ACCOUNT — Google/YouTube account creation
// ============================================================
async function handleCreateAccount(page, task, paths, accountTemplate, proxy) {
    try {
        let success = false;
        let pAcc = null;

        const firstNames = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Sam', 'Drew', 'Avery', 'Blake'];
        const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller', 'Wilson', 'Anderson', 'Thomas'];
        
        const methods = [
            // METHOD 1: Direct Google account creation
            async () => {
                // Mobile endpoint — reduced captcha friction
                await page.goto('https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp&theme=mn', { waitUntil: 'load' });
                await page.waitForTimeout(3000 + Math.random() * 2000);
                
                const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
                const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
                
                // Fill first name (language-agnostic input[name])
                const fnInput = await page.locator('input[name="firstName"], input#firstName');
                if (await fnInput.count() === 0) return null;
                
                await fnInput.first().fill(firstName);
                await page.waitForTimeout(500 + Math.random() * 700);
                
                const lnInput = await page.locator('input[name="lastName"], input#lastName');
                if (await lnInput.count() > 0) {
                    await lnInput.first().fill(lastName);
                    await page.waitForTimeout(500 + Math.random() * 700);
                }
                
                await page.keyboard.press('Enter');
                await page.waitForTimeout(3000 + Math.random() * 2000);
                
                // Birthday step
                const monthSelect = await page.locator('select#month, [id*="month"]');
                if (await monthSelect.count() > 0) {
                    await monthSelect.first().selectOption('1');
                    
                    const dayInput = await page.locator('input#day');
                    if (await dayInput.count() > 0) await dayInput.first().fill('15');
                    
                    const yearInput = await page.locator('input#year');
                    if (await yearInput.count() > 0) await yearInput.first().fill('1998');
                    
                    const genderSelect = await page.locator('select#gender');
                    if (await genderSelect.count() > 0) await genderSelect.first().selectOption('1');
                    
                    await page.keyboard.press('Enter');
                    await page.waitForTimeout(3000);
                }
                
                // Username step
                const usernameInput = await page.locator('input[name="Username"]');
                const username = `${firstName.toLowerCase()}${lastName.toLowerCase()}${Math.floor(Math.random() * 9999)}`;
                
                if (await usernameInput.count() > 0) {
                    await usernameInput.first().fill(username);
                    await page.waitForTimeout(800);
                    await page.keyboard.press('Enter');
                    await page.waitForTimeout(3000);
                }
                
                // Password step
                const passInput = await page.locator('input[name="Passwd"]');
                const password = `Yt${firstName}!${Math.random().toString(36).substring(2, 10)}`;
                
                if (await passInput.count() > 0) {
                    await passInput.first().fill(password);
                    const confirmPass = await page.locator('input[name="PasswdAgain"], input[name="ConfirmPasswd"]');
                    if (await confirmPass.count() > 0) await confirmPass.first().fill(password);
                    await page.keyboard.press('Enter');
                    await page.waitForTimeout(3000);
                }
                
                return {
                    username: `${username}@gmail.com`,
                    password: password,
                    firstName: firstName,
                    lastName: lastName
                };
            },
            
            // METHOD 2: Mobile YouTube signup (UA already set by Virtual Box layer)
            async () => {
                await page.goto('https://m.youtube.com/', { waitUntil: 'load' });
                await page.waitForTimeout(2000 + Math.random() * 1000);
                
                const signInLink = await page.locator('a[href*="ServiceLogin"], .topbar-menu-button-avatar-button, a[href*="accounts.google"]');
                if (await signInLink.count() > 0) {
                    await signInLink.first().click();
                    await page.waitForTimeout(3000);
                    
                    // Look for Create Account
                    const createAccBtn = await page.locator('[jsname="rwl3qc"], button:has-text("Create account")');
                    if (await createAccBtn.count() > 0) {
                        await createAccBtn.first().click();
                        await page.waitForTimeout(1000);
                        
                        const forMyself = await page.locator('li:first-child, [jsname="rzzeO"]');
                        if (await forMyself.count() > 0) {
                            await forMyself.first().click();
                            await page.waitForTimeout(2000);
                            
                            return {
                                username: `ytmobile_${Math.random().toString(36).substring(7)}@gmail.com`,
                                password: `YtMobile!${Math.random().toString(36).substring(2, 10)}`,
                                firstName: 'Mobile',
                                lastName: 'User'
                            };
                        }
                    }
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
                        username: res.username,
                        email: res.username,
                        password: res.password,
                        firstName: res.firstName,
                        lastName: res.lastName,
                        platform: 'youtube',
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

        return { success: false, error: 'Account creation blocked by Google anti-bot. Try using residential proxies or manual verification.' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = { executeAction };
