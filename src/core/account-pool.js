const fs = require('fs');
const path = require('path');

// ============================================================
// ACCOUNT POOL MANAGER — 100% FREE
// 
// Loads existing accounts from:
// 1. TXT files (email:password format)
// 2. Cookie JSON files (exported from browser)
// 3. Session token files
//
// Manages rotation, cooldown, and ban tracking
// ============================================================

class AccountPool {
    constructor(basePath) {
        this.basePath = basePath || path.join(process.env.APPDATA || process.env.HOME, 'smm-data', 'accounts');
        this.pools = new Map(); // platform -> [{ id, email, password, cookies, status, lastUsed, cooldownUntil }]
        this.ensureDirs();
    }

    ensureDirs() {
        const dirs = [
            this.basePath,
            path.join(this.basePath, 'youtube'),
            path.join(this.basePath, 'instagram'),
            path.join(this.basePath, 'tiktok'),
            path.join(this.basePath, 'discord'),
            path.join(this.basePath, 'facebook'),
            path.join(this.basePath, 'twitter'),
            path.join(this.basePath, 'telegram'),
            path.join(this.basePath, 'twitch'),
            path.join(this.basePath, 'spotify'),
            path.join(this.basePath, 'roblox'),
            path.join(this.basePath, 'cookies')
        ];
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }

    /**
     * Load accounts from TXT file
     * Supported formats:
     *   email:password
     *   email:password:extra_info
     *   email|password
     *   email\tpassword
     * 
     * @param {string} platform 
     * @param {string} filePath — optional, defaults to accounts/{platform}/accounts.txt
     */
    loadFromTxt(platform, filePath) {
        const fp = filePath || path.join(this.basePath, platform, 'accounts.txt');
        if (!fs.existsSync(fp)) return [];

        const content = fs.readFileSync(fp, 'utf8');
        const lines = content.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('//'));
        const accounts = [];

        for (const line of lines) {
            // Support multiple delimiters
            let parts;
            if (line.includes(':')) parts = line.split(':');
            else if (line.includes('|')) parts = line.split('|');
            else if (line.includes('\t')) parts = line.split('\t');
            else continue;

            if (parts.length >= 2) {
                const email = parts[0].trim();
                const password = parts[1].trim();
                const extra = parts.slice(2).join(':').trim();

                accounts.push({
                    id: `${platform}_${Buffer.from(email).toString('base64').substring(0, 12)}`,
                    email,
                    password,
                    extra: extra || null,
                    cookies: null,
                    status: 'active', // active | cooldown | banned | used
                    lastUsed: 0,
                    cooldownUntil: 0,
                    useCount: 0,
                    platform
                });
            }
        }

        // Merge into pool (don't duplicate)
        if (!this.pools.has(platform)) this.pools.set(platform, []);
        const pool = this.pools.get(platform);
        for (const acc of accounts) {
            if (!pool.find(a => a.email === acc.email)) {
                pool.push(acc);
            }
        }

        return accounts;
    }

    /**
     * Load cookies from JSON files in accounts/{platform}/cookies/
     * Each JSON file should be an array of cookie objects (Playwright/Puppeteer format)
     */
    loadCookies(platform) {
        const cookieDir = path.join(this.basePath, platform, 'cookies');
        if (!fs.existsSync(cookieDir)) {
            fs.mkdirSync(cookieDir, { recursive: true });
            return [];
        }

        const files = fs.readdirSync(cookieDir).filter(f => f.endsWith('.json'));
        const accounts = [];

        for (const file of files) {
            try {
                const cookies = JSON.parse(fs.readFileSync(path.join(cookieDir, file), 'utf8'));
                const name = path.basename(file, '.json');
                accounts.push({
                    id: `${platform}_cookie_${name}`,
                    email: name,
                    password: null,
                    cookies: Array.isArray(cookies) ? cookies : (cookies.cookies || []),
                    status: 'active',
                    lastUsed: 0,
                    cooldownUntil: 0,
                    useCount: 0,
                    platform
                });
            } catch (e) {}
        }

        if (!this.pools.has(platform)) this.pools.set(platform, []);
        const pool = this.pools.get(platform);
        for (const acc of accounts) {
            if (!pool.find(a => a.id === acc.id)) {
                pool.push(acc);
            }
        }

        return accounts;
    }

    /**
     * Load ALL accounts for a platform (TXT + Cookies)
     */
    loadAll(platform) {
        this.loadFromTxt(platform);
        this.loadCookies(platform);
        return this.pools.get(platform) || [];
    }

    /**
     * Get next available account (respects cooldown and bans)
     * @param {string} platform 
     * @param {number} cooldownMs — minimum time between uses (default 5 min)
     * @returns {object|null}
     */
    getNext(platform, cooldownMs = 300000) {
        if (!this.pools.has(platform)) this.loadAll(platform);
        const pool = this.pools.get(platform) || [];
        const now = Date.now();

        // Sort by least recently used
        const available = pool
            .filter(a => a.status === 'active' && now >= a.cooldownUntil)
            .sort((a, b) => a.lastUsed - b.lastUsed);

        if (available.length === 0) return null;

        const account = available[0];
        account.lastUsed = now;
        account.cooldownUntil = now + cooldownMs;
        account.useCount++;
        account.status = 'active';
        
        return account;
    }

    /**
     * Mark account as done (put on cooldown)
     */
    release(accountId, cooldownMs = 300000) {
        for (const [, pool] of this.pools) {
            const acc = pool.find(a => a.id === accountId);
            if (acc) {
                acc.cooldownUntil = Date.now() + cooldownMs;
                acc.status = 'active';
                return;
            }
        }
    }

    /**
     * Mark account as banned (won't be used again)
     */
    ban(accountId) {
        for (const [, pool] of this.pools) {
            const acc = pool.find(a => a.id === accountId);
            if (acc) {
                acc.status = 'banned';
                return;
            }
        }
    }

    /**
     * Get pool stats
     */
    getStats(platform) {
        const pool = this.pools.get(platform) || [];
        const now = Date.now();
        return {
            total: pool.length,
            active: pool.filter(a => a.status === 'active' && now >= a.cooldownUntil).length,
            cooldown: pool.filter(a => a.status === 'active' && now < a.cooldownUntil).length,
            banned: pool.filter(a => a.status === 'banned').length,
            withCookies: pool.filter(a => a.cookies && a.cookies.length > 0).length,
            withPassword: pool.filter(a => a.password).length
        };
    }

    /**
     * Add a single account programmatically
     */
    addAccount(platform, email, password, cookies = null) {
        if (!this.pools.has(platform)) this.pools.set(platform, []);
        const pool = this.pools.get(platform);
        
        if (pool.find(a => a.email === email)) return false;

        pool.push({
            id: `${platform}_${Buffer.from(email).toString('base64').substring(0, 12)}`,
            email,
            password,
            cookies,
            status: 'active',
            lastUsed: 0,
            cooldownUntil: 0,
            useCount: 0,
            platform
        });

        return true;
    }

    /**
     * Save current pool state to disk (for persistence between sessions)
     */
    saveState(platform) {
        const pool = this.pools.get(platform) || [];
        const statePath = path.join(this.basePath, platform, 'pool-state.json');
        try {
            const safePool = pool.map(a => ({
                ...a,
                cookies: a.cookies ? '[COOKIES_PRESENT]' : null // Don't save raw cookies to state
            }));
            fs.writeFileSync(statePath, JSON.stringify(safePool, null, 2));
        } catch (e) {}
    }

    /**
     * Get all accounts for display in UI
     */
    listAccounts(platform) {
        if (!this.pools.has(platform)) this.loadAll(platform);
        return (this.pools.get(platform) || []).map(a => ({
            id: a.id,
            email: a.email,
            status: a.status,
            hasCookies: !!(a.cookies && a.cookies.length > 0),
            hasPassword: !!a.password,
            useCount: a.useCount,
            lastUsed: a.lastUsed ? new Date(a.lastUsed).toLocaleString() : 'Never'
        }));
    }
}

// Singleton
let instance = null;
function getPool(basePath) {
    if (!instance) instance = new AccountPool(basePath);
    return instance;
}

module.exports = { AccountPool, getPool };
