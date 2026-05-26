const browserManager = require('../core/browser');
const fs = require('fs');
const path = require('path');

// ============================================================
// SPOTIFY PLATFORM MODULE
// Supports: create-account, follow, play, save, playlist-add
// Uses data-testid selectors which Spotify maintains for testing
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
            return { success: false, error: 'Spotify authorization failed or session expired' };
        }

        switch (action) {
            case 'follow': return await handleFollow(page, task.targetUrl || task.target);
            case 'play': return await handlePlay(page, task.targetUrl, task.duration || 60000);
            case 'save': return await handleSave(page, task.targetUrl);
            case 'playlist-add': return await handlePlaylistAdd(page, task.targetUrl);
            default: return { success: false, error: `Action '${action}' not supported on Spotify.` };
        }
    } catch (e) {
        return { success: false, error: `Critical Spotify error: ${e.message}` };
    } finally {
        await browser.close();
    }
}

// ============================================================
// LOGIN — Session restore + credential-based login
// ============================================================
async function login(page, account, paths) {
    try {
        const sessionPath = path.join(paths.SESSIONS_PATH, `sp_${account.id}.json`);
        
        // STEP 1: Try restoring session
        if (fs.existsSync(sessionPath)) {
            const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            await page.context().addCookies(cookies);
            await page.goto('https://open.spotify.com/', { waitUntil: 'load' });
            await page.waitForTimeout(3000);
            
            const isLoggedIn = await page.locator('[data-testid="user-widget-avatar"], [data-testid="user-widget-link"], button[data-testid="user-widget"]').count();
            if (isLoggedIn > 0) return true;
        }

        // STEP 2: Fresh login
        await page.goto('https://accounts.spotify.com/en/login', { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1000);
        
        // Spotify login IDs are stable
        const usernameInput = await page.locator('#login-username, input[data-testid="login-username"]');
        const passwordInput = await page.locator('#login-password, input[data-testid="login-password"]');
        
        if (await usernameInput.count() > 0 && await passwordInput.count() > 0) {
            await usernameInput.first().fill(account.email || account.username);
            await page.waitForTimeout(500 + Math.random() * 500);
            await passwordInput.first().fill(account.password);
            await page.waitForTimeout(500 + Math.random() * 500);
            
            const loginBtn = await page.locator('#login-button, button[data-testid="login-button"]');
            if (await loginBtn.count() > 0) {
                await loginBtn.first().click();
                await page.waitForTimeout(5000);
            }
        }

        // Verify login
        const currentUrl = page.url();
        if (currentUrl.includes('open.spotify') || currentUrl.includes('accounts.spotify.com/en/status')) {
            const cookies = await page.context().cookies();
            try { fs.writeFileSync(sessionPath, JSON.stringify(cookies)); } catch (e) {}
            return true;
        }
        
        // Final check for avatar
        const finalCheck = await page.locator('[data-testid="user-widget-avatar"], [data-testid="user-widget-link"]').count();
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
// FOLLOW — Follow an artist/user/playlist
// ============================================================
async function handleFollow(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 2000);
        
        // Spotify uses data-testid="follow-button" universally
        const followBtn = await page.locator('button[data-testid="follow-button"]');
        if (await followBtn.count() > 0) {
            const isFollowing = await followBtn.first().getAttribute('aria-label') || '';
            if (isFollowing.toLowerCase().includes('unfollow') || isFollowing.toLowerCase().includes('following')) {
                return { success: true, message: 'Already following this artist/playlist' };
            }
            await followBtn.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }
        
        // Fallback: Check for heart/save button as alternative
        const heartBtn = await page.locator('button[data-testid="add-button"]');
        if (await heartBtn.count() > 0) {
            await heartBtn.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }
        
        return { success: false, error: 'Follow element not found or already following' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// PLAY — Start playing a track/album/playlist and wait
// ============================================================
async function handlePlay(page, targetUrl, duration) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 2000);
        
        // Main play button
        const playBtn = await page.locator('[data-testid="play-button"], button[aria-label="Play"]');
        if (await playBtn.count() > 0) {
            await playBtn.first().click();
            const viewDuration = parseInt(duration) || 60000;
            
            // Simulate human presence — occasional scroll
            const scrollInterval = setInterval(async () => {
                try {
                    await page.evaluate(() => window.scrollBy(0, Math.random() * 100));
                } catch (e) {}
            }, 15000);
            
            await page.waitForTimeout(viewDuration);
            clearInterval(scrollInterval);
            return { success: true };
        }
        
        // Fallback: click on the first track row to start playing
        const trackRow = await page.locator('[data-testid="tracklist-row"]');
        if (await trackRow.count() > 0) {
            await trackRow.first().dblclick();
            const viewDuration = parseInt(duration) || 60000;
            await page.waitForTimeout(viewDuration);
            return { success: true };
        }
        
        return { success: false, error: 'Play button not found on this page' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// SAVE — Save a track/album to user's library
// ============================================================
async function handleSave(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1500);
        
        // Spotify uses "add-button" for saving tracks/albums
        const saveBtn = await page.locator('button[data-testid="add-button"], button[aria-label*="Save"]');
        if (await saveBtn.count() > 0) {
            const ariaLabel = await saveBtn.first().getAttribute('aria-label') || '';
            if (ariaLabel.toLowerCase().includes('remove') || ariaLabel.toLowerCase().includes('saved')) {
                return { success: true, message: 'Already saved to library' };
            }
            await saveBtn.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }
        
        // Fallback: three-dot menu -> Save to Library
        const moreBtn = await page.locator('button[data-testid="more-button"]');
        if (await moreBtn.count() > 0) {
            await moreBtn.first().click();
            await page.waitForTimeout(500);
            
            const menuItems = await page.locator('[data-testid="context-menu"] li, div[role="menuitem"]');
            const count = await menuItems.count();
            for (let i = 0; i < count; i++) {
                const text = await menuItems.nth(i).innerText();
                if (text.toLowerCase().includes('save') || text.toLowerCase().includes('library') || text.toLowerCase().includes('like')) {
                    await menuItems.nth(i).click();
                    await page.waitForTimeout(2000);
                    return { success: true };
                }
            }
        }
        
        return { success: false, error: 'Save button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// PLAYLIST ADD — Add current track to a user's playlist
// ============================================================
async function handlePlaylistAdd(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'load' });
        await page.waitForTimeout(2000 + Math.random() * 1500);
        
        // Open the three-dot context menu
        const moreBtn = await page.locator('button[data-testid="more-button"]');
        if (await moreBtn.count() > 0) {
            await moreBtn.first().click();
            await page.waitForTimeout(500);
            
            // Look for the "Add to playlist" option
            const menuItems = await page.locator('[data-testid="context-menu"] li, div[role="menuitem"]');
            const count = await menuItems.count();
            for (let i = 0; i < count; i++) {
                const text = await menuItems.nth(i).innerText();
                if (text.toLowerCase().includes('playlist') || text.toLowerCase().includes('add to')) {
                    await menuItems.nth(i).click();
                    await page.waitForTimeout(1000);
                    
                    // Pick any playlist from the submenu
                    const playlistItems = await page.locator('div[role="menuitem"], li[role="option"]');
                    if (await playlistItems.count() > 0) {
                        await playlistItems.first().click();
                        await page.waitForTimeout(2000);
                        return { success: true };
                    }
                }
            }
        }
        
        return { success: false, error: 'Could not add to playlist — menu not accessible' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// CREATE ACCOUNT — Step-by-step Spotify signup
// ============================================================
async function handleCreateAccount(page, task, paths, accountTemplate, proxy) {
    try {
        let success = false;
        let pAcc = null;

        const methods = [
            // METHOD 1: Multi-step Spotify signup form
            async () => {
                await page.goto('https://www.spotify.com/signup', { waitUntil: 'load' });
                await page.waitForTimeout(2000 + Math.random() * 1000);

                const email = `sp_${Math.random().toString(36).substring(2, 10)}@example.com`;
                const pass = `SpPass!${Math.random().toString(36).substring(2, 10)}`;
                const displayName = `SpotUser_${Math.floor(Math.random() * 9999)}`;

                // Step 1: Email
                const emailInput = await page.locator('#username, input[data-testid="email-input"]');
                if (await emailInput.count() > 0) {
                    await emailInput.first().fill(email);
                    await page.waitForTimeout(800 + Math.random() * 500);
                    
                    const nextBtn = await page.locator('button[data-testid="submit"], button[type="submit"]');
                    if (await nextBtn.count() > 0) {
                        await nextBtn.first().click();
                        await page.waitForTimeout(2000);
                    }
                }

                // Step 2: Password
                const passInput = await page.locator('#new-password, input[data-testid="password-input"]');
                if (await passInput.count() > 0) {
                    await passInput.first().fill(pass);
                    await page.waitForTimeout(800 + Math.random() * 500);
                    
                    const nextBtn = await page.locator('button[data-testid="submit"], button[type="submit"]');
                    if (await nextBtn.count() > 0) {
                        await nextBtn.first().click();
                        await page.waitForTimeout(2000);
                    }
                }

                // Step 3: Profile info (name, dob, gender)
                const nameInput = await page.locator('#displayName, input[data-testid="displayName-input"]');
                if (await nameInput.count() > 0) {
                    await nameInput.first().fill(displayName);
                    await page.waitForTimeout(500);
                }
                
                const dayInput = await page.locator('#day, input[data-testid="day-input"]');
                if (await dayInput.count() > 0) await dayInput.first().fill('15');
                
                const monthSelect = await page.locator('#month, select[data-testid="month-input"]');
                if (await monthSelect.count() > 0) await monthSelect.first().selectOption('01');
                
                const yearInput = await page.locator('#year, input[data-testid="year-input"]');
                if (await yearInput.count() > 0) await yearInput.first().fill('1998');
                
                await page.waitForTimeout(500 + Math.random() * 500);
                
                // Gender selection — click the first radio
                const genderRadio = await page.locator('input[name="gender"], label[for="gender_option_male"]');
                if (await genderRadio.count() > 0) {
                    await genderRadio.first().click();
                    await page.waitForTimeout(500);
                }

                // Final signup submission
                const signupBtn = await page.locator('button[data-testid="submit"], button[type="submit"]');
                if (await signupBtn.count() > 0) {
                    await signupBtn.first().click();
                    await page.waitForTimeout(5000);
                }

                return { email, password: pass, displayName };
            }
        ];

        for (let i = 0; i < methods.length; i++) {
            try {
                const res = await methods[i]();
                if (res) {
                    success = true;
                    pAcc = {
                        email: res.email,
                        password: res.password,
                        username: res.displayName,
                        platform: 'spotify',
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

        return { success: false, error: 'Spotify registration failed — captcha or selectors changed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = { executeAction };
