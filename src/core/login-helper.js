// ============================================================
// LOGIN HELPER — Universal login for all platforms
// Supports: email+password, cookies, session restoration
// Uses ghost-cursor for human-like behavior
// ============================================================

async function loginWithCookies(page, cookies, url) {
    try {
        if (!cookies || cookies.length === 0) return false;
        
        // Navigate to domain first
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
        
        // Add cookies
        const context = page.context();
        await context.addCookies(cookies);
        
        // Reload with cookies
        await page.reload({ waitUntil: 'load', timeout: 15000 });
        await page.waitForTimeout(3000);
        
        return true;
    } catch (e) {
        return false;
    }
}

async function humanType(page, selector, text) {
    try {
        const el = await page.locator(selector);
        if (await el.count() > 0) {
            await el.first().focus();
            await page.waitForTimeout(300 + Math.random() * 300);
            await page.keyboard.type(text, { delay: 55 + Math.random() * 55 });
            await page.waitForTimeout(500 + Math.random() * 500);
            return true;
        }
    } catch (e) {}
    return false;
}

async function humanClick(page, selector) {
    try {
        let cursor;
        try {
            const { createCursor } = require('ghost-cursor');
            cursor = createCursor(page);
        } catch(e) {}
        
        if (cursor) {
            try { await cursor.click(selector); return true; } catch(e) {}
        }
        
        const el = await page.locator(selector);
        if (await el.count() > 0) {
            await el.first().click();
            return true;
        }
    } catch (e) {}
    return false;
}

async function solveCaptchaIfPresent(page) {
    try {
        const captchaPresent = await page.locator(
            'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="captcha"], div[id*="captcha"]'
        ).count() > 0;
        
        if (captchaPresent) {
            const captchaSolver = require('./captcha-solver');
            const result = await captchaSolver.solvePlaywrightVisual(page);
            return result.success;
        }
    } catch (e) {}
    return true; // No captcha = success
}

/**
 * Login to YouTube/Google with email+password
 */
async function loginGoogle(page, email, password) {
    try {
        await page.goto('https://accounts.google.com/signin', { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(2000 + Math.random() * 2000);

        // Email step
        const emailFilled = await humanType(page, 'input[type="email"], input#identifierId', email);
        if (!emailFilled) return { success: false, error: 'Email input not found' };

        await humanClick(page, '#identifierNext button, button:has-text("Next"), button:has-text("Davom")');
        await page.waitForTimeout(4000 + Math.random() * 2000);

        // Captcha check
        await solveCaptchaIfPresent(page);

        // Password step
        const passFilled = await humanType(page, 'input[type="password"], input[name="Passwd"]', password);
        if (!passFilled) return { success: false, error: 'Password input not found (possible verification block)' };

        await humanClick(page, '#passwordNext button, button:has-text("Next"), button:has-text("Davom")');
        await page.waitForTimeout(5000 + Math.random() * 3000);

        // Captcha check again
        await solveCaptchaIfPresent(page);

        // Check if login succeeded (should be on myaccount or similar)
        const url = page.url();
        if (url.includes('myaccount') || url.includes('youtube') || url.includes('accounts.google.com/v3') || !url.includes('signin')) {
            return { success: true };
        }

        // Check for security challenge
        const challengePresent = await page.locator('input[type="tel"], div:has-text("Verify"), div:has-text("Confirm")').count() > 0;
        if (challengePresent) {
            return { success: false, error: 'Security challenge (phone verification needed)' };
        }

        return { success: false, error: 'Login may have failed — unknown page state' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Login to Instagram
 */
async function loginInstagram(page, email, password) {
    try {
        await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 2000);

        // Accept cookies if popup
        await humanClick(page, 'button:has-text("Allow"), button:has-text("Accept"), button[tabindex="0"]:has-text("essential")');
        await page.waitForTimeout(1000);

        await humanType(page, 'input[name="username"], input[aria-label*="username" i], input[aria-label*="email" i]', email);
        await humanType(page, 'input[name="password"], input[type="password"]', password);
        await page.waitForTimeout(1000 + Math.random() * 1000);

        await humanClick(page, 'button[type="submit"], button:has-text("Log in"), button:has-text("Log In")');
        await page.waitForTimeout(6000 + Math.random() * 3000);

        await solveCaptchaIfPresent(page);

        // Skip "Save Login Info" popup
        await humanClick(page, 'button:has-text("Not Now"), button:has-text("Not now")');
        await page.waitForTimeout(2000);
        // Skip notifications popup
        await humanClick(page, 'button:has-text("Not Now"), button:has-text("Not now")');
        await page.waitForTimeout(1000);

        const url = page.url();
        if (!url.includes('login') && !url.includes('challenge')) {
            return { success: true };
        }

        return { success: false, error: 'Login failed or challenge appeared' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Login to TikTok
 */
async function loginTikTok(page, email, password) {
    try {
        await page.goto('https://www.tiktok.com/login/phone-or-email/email', { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 2000);

        await humanType(page, 'input[name="username"], input[placeholder*="email" i], input[type="text"]', email);
        await humanType(page, 'input[type="password"]', password);
        await page.waitForTimeout(1000);

        await humanClick(page, 'button[data-e2e="login-button"], button[type="submit"]');
        await page.waitForTimeout(6000 + Math.random() * 3000);

        await solveCaptchaIfPresent(page);

        const url = page.url();
        if (!url.includes('login')) {
            return { success: true };
        }
        return { success: false, error: 'Login failed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Login to Discord
 */
async function loginDiscord(page, email, password) {
    try {
        await page.goto('https://discord.com/login', { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 2000);

        await humanType(page, 'input[name="email"]', email);
        await humanType(page, 'input[name="password"], input[type="password"]', password);
        await page.waitForTimeout(1000);

        await humanClick(page, 'button[type="submit"]');
        await page.waitForTimeout(7000 + Math.random() * 3000);

        await solveCaptchaIfPresent(page);

        const url = page.url();
        if (url.includes('channels') || url.includes('app')) {
            return { success: true };
        }
        return { success: false, error: 'Login failed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Login to Twitter/X
 */
async function loginTwitter(page, email, password) {
    try {
        await page.goto('https://twitter.com/i/flow/login', { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 2000);

        await humanType(page, 'input[autocomplete="username"], input[name="text"]', email);
        await humanClick(page, 'div[role="button"]:has-text("Next"), button:has-text("Next")');
        await page.waitForTimeout(3000);

        await humanType(page, 'input[name="password"], input[type="password"]', password);
        await humanClick(page, 'div[role="button"]:has-text("Log in"), button:has-text("Log in")');
        await page.waitForTimeout(6000 + Math.random() * 3000);

        await solveCaptchaIfPresent(page);

        const url = page.url();
        if (url.includes('home') || !url.includes('login')) {
            return { success: true };
        }
        return { success: false, error: 'Login failed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Login to Facebook
 */
async function loginFacebook(page, email, password) {
    try {
        await page.goto('https://www.facebook.com/login', { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 2000);

        // Accept cookies
        await humanClick(page, 'button[data-cookiebanner="accept_button"], button:has-text("Allow"), button[title*="Accept"]');
        await page.waitForTimeout(1000);

        await humanType(page, 'input#email, input[name="email"]', email);
        await humanType(page, 'input#pass, input[name="pass"]', password);
        await page.waitForTimeout(1000);

        await humanClick(page, 'button[name="login"], button#loginbutton, button[type="submit"]');
        await page.waitForTimeout(6000 + Math.random() * 3000);

        await solveCaptchaIfPresent(page);

        const url = page.url();
        if (!url.includes('login') && !url.includes('checkpoint')) {
            return { success: true };
        }
        return { success: false, error: 'Login failed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Login to Twitch
 */
async function loginTwitch(page, email, password) {
    try {
        await page.goto('https://www.twitch.tv/login', { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 2000);

        await humanType(page, 'input#login-username, input[autocomplete="username"]', email);
        await humanType(page, 'input#password-input, input[type="password"]', password);
        await page.waitForTimeout(1000);

        await humanClick(page, 'button[data-a-target="passport-login-button"], button:has-text("Log In")');
        await page.waitForTimeout(6000 + Math.random() * 3000);

        await solveCaptchaIfPresent(page);

        const url = page.url();
        if (!url.includes('login')) {
            return { success: true };
        }
        return { success: false, error: 'Login failed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Login to Spotify
 */
async function loginSpotify(page, email, password) {
    try {
        await page.goto('https://accounts.spotify.com/login', { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 2000);

        // Accept cookies
        await humanClick(page, 'button#onetrust-accept-btn-handler');
        await page.waitForTimeout(1000);

        await humanType(page, 'input#login-username, input[data-testid="login-username"]', email);
        await humanType(page, 'input#login-password, input[data-testid="login-password"]', password);
        await page.waitForTimeout(1000);

        await humanClick(page, 'button#login-button, button[data-testid="login-button"]');
        await page.waitForTimeout(6000 + Math.random() * 3000);

        await solveCaptchaIfPresent(page);

        const url = page.url();
        if (!url.includes('login')) {
            return { success: true };
        }
        return { success: false, error: 'Login failed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// Map platform names to login functions
const loginMap = {
    youtube: loginGoogle,
    google: loginGoogle,
    instagram: loginInstagram,
    tiktok: loginTikTok,
    discord: loginDiscord,
    twitter: loginTwitter,
    facebook: loginFacebook,
    twitch: loginTwitch,
    spotify: loginSpotify
};

/**
 * Universal login — tries cookies first, then email+password
 */
async function universalLogin(page, account, platform) {
    // Try cookies first (most reliable)
    if (account.cookies && account.cookies.length > 0) {
        const platformUrls = {
            youtube: 'https://www.youtube.com',
            google: 'https://accounts.google.com',
            instagram: 'https://www.instagram.com',
            tiktok: 'https://www.tiktok.com',
            discord: 'https://discord.com',
            twitter: 'https://twitter.com',
            facebook: 'https://www.facebook.com',
            twitch: 'https://www.twitch.tv',
            spotify: 'https://open.spotify.com'
        };

        const url = platformUrls[platform] || `https://www.${platform}.com`;
        const cookieLogin = await loginWithCookies(page, account.cookies, url);
        if (cookieLogin) {
            return { success: true, method: 'cookies' };
        }
    }

    // Fall back to email+password
    if (account.email && account.password) {
        const loginFn = loginMap[platform];
        if (loginFn) {
            const result = await loginFn(page, account.email, account.password);
            if (result.success) {
                return { success: true, method: 'password' };
            }
            return { success: false, error: result.error, method: 'password' };
        }
    }

    return { success: false, error: 'No login method available' };
}

module.exports = {
    universalLogin,
    loginWithCookies,
    loginGoogle,
    loginInstagram,
    loginTikTok,
    loginDiscord,
    loginTwitter,
    loginFacebook,
    loginTwitch,
    loginSpotify,
    humanType,
    humanClick,
    solveCaptchaIfPresent
};
