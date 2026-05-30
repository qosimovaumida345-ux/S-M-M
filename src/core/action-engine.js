// ============================================================
// ACTION ENGINE — Subscribe, Follow, Like, Join
// Works with existing logged-in accounts from Account Pool
// 100% FREE, uses ghost-cursor for stealth
// ============================================================

const { humanClick, humanType, solveCaptchaIfPresent } = require('./login-helper');

// ======================== YOUTUBE ========================
async function youtubeSubscribe(page, channelUrl) {
    try {
        // Navigate to channel
        const url = channelUrl.startsWith('http') ? channelUrl : `https://www.youtube.com/${channelUrl}`;
        await page.goto(url, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 3000);

        // Check if already subscribed
        const subscribedBtn = await page.locator('button[aria-label*="Unsubscribe"], yt-button-shape:has-text("Subscribed")');
        if (await subscribedBtn.count() > 0) {
            return { success: true, alreadySubscribed: true };
        }

        // Click Subscribe button
        const subBtn = await page.locator(
            '#subscribe-button button, ' +
            'ytd-subscribe-button-renderer button, ' +
            'button:has-text("Subscribe"), ' +
            'yt-button-shape:has-text("Subscribe")'
        );
        
        if (await subBtn.count() > 0) {
            await subBtn.first().click();
            await page.waitForTimeout(3000 + Math.random() * 2000);

            // Check for success
            const nowSubscribed = await page.locator('button[aria-label*="Unsubscribe"], yt-button-shape:has-text("Subscribed")');
            if (await nowSubscribed.count() > 0) {
                return { success: true };
            }
        }

        return { success: false, error: 'Subscribe button not found or click failed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function youtubeLike(page, videoUrl) {
    try {
        await page.goto(videoUrl, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 3000);

        // Wait for video to start loading
        await page.waitForTimeout(5000);

        const likeBtn = await page.locator(
            'button[aria-label*="like this video" i], ' +
            'ytd-toggle-button-renderer:first-child button, ' +
            'like-button-view-model button, ' +
            '#top-level-buttons-computed ytd-toggle-button-renderer:first-child button'
        );

        if (await likeBtn.count() > 0) {
            const isPressed = await likeBtn.first().getAttribute('aria-pressed');
            if (isPressed === 'true') {
                return { success: true, alreadyLiked: true };
            }
            await likeBtn.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }

        return { success: false, error: 'Like button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ======================== INSTAGRAM ========================
async function instagramFollow(page, username) {
    try {
        const profileUrl = username.startsWith('http') ? username : `https://www.instagram.com/${username.replace('@', '')}/`;
        await page.goto(profileUrl, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 3000);

        // Check if already following
        const followingBtn = await page.locator('button:has-text("Following"), button:has-text("Requested")');
        if (await followingBtn.count() > 0) {
            return { success: true, alreadyFollowing: true };
        }

        const followBtn = await page.locator(
            'button:has-text("Follow"), ' +
            'div[role="button"]:has-text("Follow")'
        );

        if (await followBtn.count() > 0) {
            // Get the first one that says exactly "Follow" not "Following" or "Follow Back"
            for (let i = 0; i < await followBtn.count(); i++) {
                const text = await followBtn.nth(i).innerText();
                if (text.trim() === 'Follow' || text.trim() === 'Follow Back') {
                    await followBtn.nth(i).click();
                    await page.waitForTimeout(3000 + Math.random() * 2000);
                    return { success: true };
                }
            }
        }

        return { success: false, error: 'Follow button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function instagramLike(page, postUrl) {
    try {
        await page.goto(postUrl, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 2000);

        const likeBtn = await page.locator(
            'span[class*="like"] button, ' +
            'svg[aria-label="Like"] >> xpath=ancestor::button, ' +
            'button svg[aria-label="Like"]'
        );

        if (await likeBtn.count() > 0) {
            await likeBtn.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }

        return { success: false, error: 'Like button not found (may already be liked)' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ======================== TIKTOK ========================
async function tiktokFollow(page, username) {
    try {
        const profileUrl = username.startsWith('http') ? username : `https://www.tiktok.com/@${username.replace('@', '')}`;
        await page.goto(profileUrl, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 3000);

        const followingBtn = await page.locator('button[data-e2e="follow-button"]:has-text("Following")');
        if (await followingBtn.count() > 0) {
            return { success: true, alreadyFollowing: true };
        }

        const followBtn = await page.locator(
            'button[data-e2e="follow-button"], ' +
            'button:has-text("Follow")'
        );

        if (await followBtn.count() > 0) {
            await followBtn.first().click();
            await page.waitForTimeout(3000 + Math.random() * 2000);
            await solveCaptchaIfPresent(page);
            return { success: true };
        }

        return { success: false, error: 'Follow button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function tiktokLike(page, videoUrl) {
    try {
        await page.goto(videoUrl, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(4000 + Math.random() * 3000);

        const likeBtn = await page.locator(
            'span[data-e2e="like-icon"], ' +
            'button[data-e2e="browse-like-icon"]'
        );

        if (await likeBtn.count() > 0) {
            await likeBtn.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }

        return { success: false, error: 'Like button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ======================== DISCORD ========================
async function discordJoinServer(page, inviteLink) {
    try {
        const url = inviteLink.startsWith('http') ? inviteLink : `https://discord.gg/${inviteLink}`;
        await page.goto(url, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 3000);

        // Check if already member
        const alreadyIn = await page.locator('button:has-text("Already a member"), div:has-text("Already in")');
        if (await alreadyIn.count() > 0) {
            return { success: true, alreadyMember: true };
        }

        // Click Accept Invite / Join Server
        const joinBtn = await page.locator(
            'button:has-text("Accept Invite"), ' +
            'button:has-text("Join"), ' +
            'button[class*="lookFilled"]'
        );

        if (await joinBtn.count() > 0) {
            await joinBtn.first().click();
            await page.waitForTimeout(5000 + Math.random() * 3000);

            await solveCaptchaIfPresent(page);

            // Handle rules/verification screens
            const agreeBtn = await page.locator('button:has-text("I have read"), button:has-text("Submit"), button:has-text("Complete")');
            if (await agreeBtn.count() > 0) {
                // Check all checkboxes first
                const checkboxes = await page.locator('div[role="checkbox"], input[type="checkbox"]');
                const cbCount = await checkboxes.count();
                for (let i = 0; i < cbCount; i++) {
                    await checkboxes.nth(i).click();
                    await page.waitForTimeout(300);
                }
                await agreeBtn.first().click();
                await page.waitForTimeout(3000);
            }

            return { success: true };
        }

        return { success: false, error: 'Join button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ======================== TWITTER ========================
async function twitterFollow(page, username) {
    try {
        const profileUrl = username.startsWith('http') ? username : `https://twitter.com/${username.replace('@', '')}`;
        await page.goto(profileUrl, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 3000);

        const followingBtn = await page.locator('div[role="button"][data-testid*="unfollow"], div[role="button"]:has-text("Following")');
        if (await followingBtn.count() > 0) {
            return { success: true, alreadyFollowing: true };
        }

        const followBtn = await page.locator(
            'div[role="button"][data-testid*="follow"], ' +
            'div[role="button"]:has-text("Follow")'
        );

        if (await followBtn.count() > 0) {
            for (let i = 0; i < await followBtn.count(); i++) {
                const text = await followBtn.nth(i).innerText();
                if (text.trim() === 'Follow') {
                    await followBtn.nth(i).click();
                    await page.waitForTimeout(3000);
                    return { success: true };
                }
            }
        }

        return { success: false, error: 'Follow button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function twitterLike(page, tweetUrl) {
    try {
        await page.goto(tweetUrl, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 2000);

        const likeBtn = await page.locator('div[role="button"][data-testid="like"]');
        if (await likeBtn.count() > 0) {
            await likeBtn.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }

        return { success: false, error: 'Like button not found (already liked?)' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ======================== FACEBOOK ========================
async function facebookLikePage(page, pageUrl) {
    try {
        await page.goto(pageUrl, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 3000);

        const likeBtn = await page.locator(
            'div[role="button"]:has-text("Like"), ' +
            'a[role="button"]:has-text("Like")'
        );

        if (await likeBtn.count() > 0) {
            for (let i = 0; i < await likeBtn.count(); i++) {
                const text = await likeBtn.nth(i).innerText();
                if (text.trim() === 'Like' || text.trim() === '👍 Like') {
                    await likeBtn.nth(i).click();
                    await page.waitForTimeout(3000);
                    return { success: true };
                }
            }
        }

        return { success: false, error: 'Like button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ======================== TWITCH ========================
async function twitchFollow(page, channelName) {
    try {
        const url = channelName.startsWith('http') ? channelName : `https://www.twitch.tv/${channelName}`;
        await page.goto(url, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(4000 + Math.random() * 3000);

        const unfollowBtn = await page.locator('button[data-a-target="unfollow-button"]');
        if (await unfollowBtn.count() > 0) {
            return { success: true, alreadyFollowing: true };
        }

        const followBtn = await page.locator(
            'button[data-a-target="follow-button"], ' +
            'button:has-text("Follow")'
        );

        if (await followBtn.count() > 0) {
            await followBtn.first().click();
            await page.waitForTimeout(3000);
            return { success: true };
        }

        return { success: false, error: 'Follow button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ======================== SPOTIFY ========================
async function spotifyFollow(page, artistUrl) {
    try {
        await page.goto(artistUrl, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000 + Math.random() * 3000);

        const followBtn = await page.locator(
            'button[data-testid="follow-button"], ' +
            'button:has-text("Follow")'
        );

        if (await followBtn.count() > 0) {
            const isFollowing = await followBtn.first().getAttribute('aria-checked');
            if (isFollowing === 'true') {
                return { success: true, alreadyFollowing: true };
            }
            await followBtn.first().click();
            await page.waitForTimeout(2000);
            return { success: true };
        }

        return { success: false, error: 'Follow button not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ======================== DISPATCHER ========================
const actionMap = {
    youtube: {
        subscribe: youtubeSubscribe,
        like: youtubeLike
    },
    instagram: {
        follow: instagramFollow,
        like: instagramLike
    },
    tiktok: {
        follow: tiktokFollow,
        like: tiktokLike
    },
    discord: {
        join: discordJoinServer
    },
    twitter: {
        follow: twitterFollow,
        like: twitterLike
    },
    facebook: {
        like: facebookLikePage
    },
    twitch: {
        follow: twitchFollow
    },
    spotify: {
        follow: spotifyFollow
    }
};

/**
 * Execute any action on any platform
 * @param {object} page — Playwright page
 * @param {string} platform — e.g. 'youtube'
 * @param {string} action — e.g. 'subscribe', 'follow', 'like', 'join'
 * @param {string} target — URL or username
 */
async function executeAction(page, platform, action, target) {
    const platformActions = actionMap[platform];
    if (!platformActions) {
        return { success: false, error: `Unknown platform: ${platform}` };
    }

    const actionFn = platformActions[action];
    if (!actionFn) {
        return { success: false, error: `Unknown action "${action}" for ${platform}` };
    }

    return await actionFn(page, target);
}

module.exports = {
    executeAction,
    youtubeSubscribe,
    youtubeLike,
    instagramFollow,
    instagramLike,
    tiktokFollow,
    tiktokLike,
    discordJoinServer,
    twitterFollow,
    twitterLike,
    facebookLikePage,
    twitchFollow,
    spotifyFollow,
    actionMap
};
