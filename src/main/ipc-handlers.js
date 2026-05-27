const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

let engine = null;
let proxyManager = null;
let smsService = null;
let captchaSolver = null;
let browserManager = null;

function lazyLoadModules() {
    if (!engine) {
        try {
            engine = require('../core/engine');
            proxyManager = require('../core/proxy-manager');
            smsService = require('../core/sms-service');
            captchaSolver = require('../core/captcha-solver');
            browserManager = require('../core/browser');
        } catch (e) {
            console.error('Module loading error:', e.message);
        }
    }
}

function readJsonFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) {}
    return null;
}

function writeJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (e) {}
}

function getAllJsonFiles(dirPath) {
    const results = [];
    try {
        if (!fs.existsSync(dirPath)) return results;
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(dirPath, file);
                const data = readJsonFile(filePath);
                if (data) results.push(data);
            }
        }
    } catch (e) {}
    return results;
}

function register(ipcMain, mainWindow, paths) {
    const { ACCOUNTS_PATH, PROXIES_PATH, TASKS_PATH, SESSIONS_PATH, LOGS_PATH, CONFIG_PATH, APP_DATA_PATH } = paths;

    ipcMain.handle('get-config', () => {
        const config = readJsonFile(CONFIG_PATH) || {};
        try { require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') }); } catch(e) {}
        if (process.env.GROQ_API_KEY) {
            config.envGroqApiKey = process.env.GROQ_API_KEY;
        }
        return config;
    });

    ipcMain.handle('check-groq-key', async (event, key) => {
        try {
            const axios = require('axios');
            const res = await axios.get('https://api.groq.com/openai/v1/models', {
                headers: { 'Authorization': `Bearer ${key}` },
                timeout: 5000
            });
            return { valid: true };
        } catch (e) {
            return { valid: false, error: e.response ? e.response.statusText : e.message };
        }
    });

    ipcMain.handle('set-groq-key', (event, key) => {
        const config = readJsonFile(CONFIG_PATH) || {};
        config.groqApiKey = key;
        writeJsonFile(CONFIG_PATH, config);
        return { success: true };
    });

    ipcMain.handle('save-config', (event, config) => {
        writeJsonFile(CONFIG_PATH, config);
        return { success: true };
    });

    ipcMain.handle('get-accounts', (event, platform) => {
        const accountsDir = platform ? path.join(ACCOUNTS_PATH, platform) : ACCOUNTS_PATH;
        if (!fs.existsSync(accountsDir)) return [];
        if (platform) {
            return getAllJsonFiles(accountsDir);
        }
        const allAccounts = [];
        try {
            const platforms = fs.readdirSync(ACCOUNTS_PATH);
            for (const plat of platforms) {
                const platDir = path.join(ACCOUNTS_PATH, plat);
                if (fs.statSync(platDir).isDirectory()) {
                    const accounts = getAllJsonFiles(platDir);
                    allAccounts.push(...accounts.map(a => ({ ...a, platform: plat })));
                }
            }
        } catch (e) {}
        return allAccounts;
    });

    ipcMain.handle('save-account', (event, account) => {
        const platform = account.platform || 'unknown';
        const platDir = path.join(ACCOUNTS_PATH, platform);
        if (!fs.existsSync(platDir)) fs.mkdirSync(platDir, { recursive: true });
        if (!account.id) account.id = uuidv4();
        account.updatedAt = new Date().toISOString();
        if (!account.createdAt) account.createdAt = account.updatedAt;
        const filePath = path.join(platDir, account.id + '.json');
        writeJsonFile(filePath, account);
        return { success: true, id: account.id };
    });

    ipcMain.handle('delete-account', (event, { platform, id }) => {
        const filePath = path.join(ACCOUNTS_PATH, platform, id + '.json');
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return { success: true };
        }
        return { success: false, error: 'Account not found' };
    });

    ipcMain.handle('import-accounts', (event, { platform, accounts }) => {
        const platDir = path.join(ACCOUNTS_PATH, platform);
        if (!fs.existsSync(platDir)) fs.mkdirSync(platDir, { recursive: true });
        let imported = 0;
        for (const acc of accounts) {
            acc.id = acc.id || uuidv4();
            acc.platform = platform;
            acc.createdAt = new Date().toISOString();
            acc.updatedAt = acc.createdAt;
            acc.status = acc.status || 'active';
            writeJsonFile(path.join(platDir, acc.id + '.json'), acc);
            imported++;
        }
        return { success: true, imported };
    });

    ipcMain.handle('export-accounts', (event, platform) => {
        const platDir = path.join(ACCOUNTS_PATH, platform);
        if (!fs.existsSync(platDir)) return { success: false, data: [] };
        return { success: true, data: getAllJsonFiles(platDir) };
    });

    ipcMain.handle('get-account-stats', () => {
        const stats = { total: 0, byPlatform: {}, byStatus: {} };
        if (!fs.existsSync(ACCOUNTS_PATH)) return stats;
        try {
            const platforms = fs.readdirSync(ACCOUNTS_PATH);
            for (const plat of platforms) {
                const platDir = path.join(ACCOUNTS_PATH, plat);
                if (fs.statSync(platDir).isDirectory()) {
                    const accounts = getAllJsonFiles(platDir);
                    stats.byPlatform[plat] = accounts.length;
                    stats.total += accounts.length;
                    for (const acc of accounts) {
                        const status = acc.status || 'unknown';
                        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
                    }
                }
            }
        } catch (e) {}
        return stats;
    });

    ipcMain.handle('get-proxies', () => {
        const proxyFile = path.join(PROXIES_PATH, 'proxies.json');
        return readJsonFile(proxyFile) || [];
    });

    ipcMain.handle('save-proxies', (event, proxies) => {
        const proxyFile = path.join(PROXIES_PATH, 'proxies.json');
        writeJsonFile(proxyFile, proxies);
        return { success: true };
    });

    ipcMain.handle('add-proxy', (event, proxy) => {
        const proxyFile = path.join(PROXIES_PATH, 'proxies.json');
        const proxies = readJsonFile(proxyFile) || [];
        proxy.id = proxy.id || uuidv4();
        proxy.addedAt = new Date().toISOString();
        proxy.status = 'unchecked';
        proxy.lastChecked = null;
        proxy.responseTime = null;
        proxy.country = proxy.country || 'Unknown';
        proxies.push(proxy);
        writeJsonFile(proxyFile, proxies);
        return { success: true, id: proxy.id };
    });

    ipcMain.handle('delete-proxy', (event, proxyId) => {
        const proxyFile = path.join(PROXIES_PATH, 'proxies.json');
        let proxies = readJsonFile(proxyFile) || [];
        proxies = proxies.filter(p => p.id !== proxyId);
        writeJsonFile(proxyFile, proxies);
        return { success: true };
    });

    ipcMain.handle('check-proxy', async (event, proxy) => {
        lazyLoadModules();
        if (proxyManager) {
            const result = await proxyManager.checkProxy(proxy);
            return result;
        }
        return { alive: false, responseTime: 0 };
    });

    ipcMain.handle('import-proxies', (event, { text, type }) => {
        const proxyFile = path.join(PROXIES_PATH, 'proxies.json');
        const existing = readJsonFile(proxyFile) || [];
        const lines = text.split('\n').filter(l => l.trim());
        let imported = 0;
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const parts = trimmed.split(':');
            if (parts.length >= 2) {
                const proxy = {
                    id: uuidv4(),
                    type: type || 'http',
                    host: parts[0],
                    port: parseInt(parts[1]),
                    username: parts[2] || '',
                    password: parts[3] || '',
                    status: 'unchecked',
                    addedAt: new Date().toISOString(),
                    lastChecked: null,
                    responseTime: null,
                    country: 'Unknown'
                };
                existing.push(proxy);
                imported++;
            }
        }
        writeJsonFile(proxyFile, existing);
        return { success: true, imported };
    });

    ipcMain.handle('get-tasks', () => {
        return getAllJsonFiles(TASKS_PATH);
    });

    ipcMain.handle('create-task', (event, task) => {
        task.id = task.id || uuidv4();
        task.createdAt = new Date().toISOString();
        task.status = 'pending';
        task.progress = 0;
        task.completed = 0;
        task.failed = 0;
        task.logs = [];
        writeJsonFile(path.join(TASKS_PATH, task.id + '.json'), task);
        return { success: true, id: task.id };
    });

    ipcMain.handle('update-task', (event, task) => {
        task.updatedAt = new Date().toISOString();
        writeJsonFile(path.join(TASKS_PATH, task.id + '.json'), task);
        return { success: true };
    });

    ipcMain.handle('delete-task', (event, taskId) => {
        const filePath = path.join(TASKS_PATH, taskId + '.json');
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return { success: true };
        }
        return { success: false };
    });

    ipcMain.handle('start-task', async (event, taskId) => {
        lazyLoadModules();
        const taskFile = path.join(TASKS_PATH, taskId + '.json');
        const task = readJsonFile(taskFile);
        if (!task) return { success: false, error: 'Task not found' };
        task.status = 'running';
        task.startedAt = new Date().toISOString();
        writeJsonFile(taskFile, task);
        if (engine) {
            engine.executeTask(task, paths, (update) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('task-progress', update);
                }
            });
        }
        return { success: true };
    });

    ipcMain.handle('stop-task', async (event, taskId) => {
        lazyLoadModules();
        if (engine) {
            engine.stopTask(taskId);
        }
        const taskFile = path.join(TASKS_PATH, taskId + '.json');
        const task = readJsonFile(taskFile);
        if (task) {
            task.status = 'stopped';
            task.stoppedAt = new Date().toISOString();
            writeJsonFile(taskFile, task);
        }
        return { success: true };
    });

    ipcMain.handle('get-dashboard-stats', () => {
        const accounts = [];
        if (fs.existsSync(ACCOUNTS_PATH)) {
            try {
                const platforms = fs.readdirSync(ACCOUNTS_PATH);
                for (const plat of platforms) {
                    const platDir = path.join(ACCOUNTS_PATH, plat);
                    if (fs.statSync(platDir).isDirectory()) {
                        const accs = getAllJsonFiles(platDir);
                        accounts.push(...accs.map(a => ({ ...a, platform: plat })));
                    }
                }
            } catch (e) {}
        }
        const tasks = getAllJsonFiles(TASKS_PATH);
        const proxyFile = path.join(PROXIES_PATH, 'proxies.json');
        const proxies = readJsonFile(proxyFile) || [];

        const totalTasks = tasks.length;
        const runningTasks = tasks.filter(t => t.status === 'running').length;
        const completedTasks = tasks.filter(t => t.status === 'completed').length;
        const failedTasks = tasks.filter(t => t.status === 'failed').length;
        const totalAccounts = accounts.length;
        const activeAccounts = accounts.filter(a => a.status === 'active').length;
        const bannedAccounts = accounts.filter(a => a.status === 'banned').length;
        const totalProxies = proxies.length;
        const aliveProxies = proxies.filter(p => p.status === 'alive').length;
        const deadProxies = proxies.filter(p => p.status === 'dead').length;

        const platformStats = {};
        for (const acc of accounts) {
            const plat = acc.platform || 'unknown';
            if (!platformStats[plat]) platformStats[plat] = { total: 0, active: 0, banned: 0 };
            platformStats[plat].total++;
            if (acc.status === 'active') platformStats[plat].active++;
            if (acc.status === 'banned') platformStats[plat].banned++;
        }

        const recentTasks = tasks
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 10);

        const totalActionsCompleted = tasks.reduce((sum, t) => sum + (t.completed || 0), 0);
        const totalActionsFailed = tasks.reduce((sum, t) => sum + (t.failed || 0), 0);

        return {
            totalTasks,
            runningTasks,
            completedTasks,
            failedTasks,
            totalAccounts,
            activeAccounts,
            bannedAccounts,
            totalProxies,
            aliveProxies,
            deadProxies,
            platformStats,
            recentTasks,
            totalActionsCompleted,
            totalActionsFailed,
            uptime: process.uptime()
        };
    });

    ipcMain.handle('get-sms-providers', () => {
        lazyLoadModules();
        if (smsService) {
            return smsService.getProviders();
        }
        return [];
    });

    ipcMain.handle('get-sms-number', async (event, { provider, country }) => {
        lazyLoadModules();
        if (smsService) {
            return await smsService.getNumber(provider, country);
        }
        return { success: false, error: 'SMS service not loaded' };
    });

    ipcMain.handle('check-sms', async (event, { provider, numberId }) => {
        lazyLoadModules();
        if (smsService) {
            return await smsService.checkSms(provider, numberId);
        }
        return { success: false, error: 'SMS service not loaded' };
    });

    ipcMain.handle('solve-captcha', async (event, { type, siteKey, pageUrl, imageData }) => {
        lazyLoadModules();
        if (captchaSolver) {
            return await captchaSolver.solve({ type, siteKey, pageUrl, imageData });
        }
        return { success: false, error: 'Captcha solver not loaded' };
    });

    ipcMain.handle('get-logs', (event, { limit, offset }) => {
        const logFiles = [];
        if (fs.existsSync(LOGS_PATH)) {
            try {
                const files = fs.readdirSync(LOGS_PATH)
                    .filter(f => f.endsWith('.log'))
                    .sort((a, b) => {
                        const aTime = fs.statSync(path.join(LOGS_PATH, a)).mtime;
                        const bTime = fs.statSync(path.join(LOGS_PATH, b)).mtime;
                        return bTime - aTime;
                    });
                const sliced = files.slice(offset || 0, (offset || 0) + (limit || 50));
                for (const file of sliced) {
                    const content = fs.readFileSync(path.join(LOGS_PATH, file), 'utf8');
                    logFiles.push({ name: file, content, time: fs.statSync(path.join(LOGS_PATH, file)).mtime });
                }
            } catch (e) {}
        }
        return logFiles;
    });

    ipcMain.handle('clear-logs', () => {
        if (fs.existsSync(LOGS_PATH)) {
            try {
                const files = fs.readdirSync(LOGS_PATH);
                for (const file of files) {
                    fs.unlinkSync(path.join(LOGS_PATH, file));
                }
            } catch (e) {}
        }
        return { success: true };
    });

    ipcMain.handle('create-accounts-bulk', async (event, { platform, count, useProxy, useVerification }) => {
        lazyLoadModules();
        if (!engine) return { success: false, error: 'Engine not loaded' };
        const task = {
            id: uuidv4(),
            type: 'account-creation',
            action: 'create-account',
            platform,
            count,
            useProxy,
            useVerification,
            createdAt: new Date().toISOString(),
            status: 'running',
            progress: 0,
            completed: 0,
            failed: 0,
            logs: []
        };
        writeJsonFile(path.join(TASKS_PATH, task.id + '.json'), task);
        engine.createAccounts(task, paths, (update) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('task-progress', update);
            }
        });
        return { success: true, taskId: task.id };
    });

    ipcMain.handle('check-all-proxies', async () => {
        lazyLoadModules();
        const proxyFile = path.join(PROXIES_PATH, 'proxies.json');
        const proxies = readJsonFile(proxyFile) || [];
        if (!proxyManager) return { success: false };
        const results = [];
        for (const proxy of proxies) {
            const result = await proxyManager.checkProxy(proxy);
            proxy.status = result.alive ? 'alive' : 'dead';
            proxy.responseTime = result.responseTime;
            proxy.lastChecked = new Date().toISOString();
            proxy.country = result.country || proxy.country;
            results.push({ id: proxy.id, ...result });
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('proxy-check-result', { id: proxy.id, ...result });
            }
        }
        writeJsonFile(proxyFile, proxies);
        return { success: true, results };
    });

    ipcMain.handle('get-supported-platforms', () => {
        return [
            { id: 'instagram', name: 'Instagram', icon: 'instagram', actions: ['follow', 'like', 'comment', 'view-story', 'create-account'] },
            { id: 'youtube', name: 'YouTube', icon: 'youtube', actions: ['subscribe', 'like', 'dislike', 'comment', 'view', 'create-account'] },
            { id: 'telegram', name: 'Telegram', icon: 'telegram', actions: ['join-channel', 'join-group', 'send-message', 'view-post', 'add-member', 'create-account'] },
            { id: 'roblox', name: 'Roblox', icon: 'roblox', actions: ['follow', 'favorite', 'join-group', 'gamepass', 'create-account'] },
            { id: 'tiktok', name: 'TikTok', icon: 'tiktok', actions: ['follow', 'like', 'comment', 'view', 'share', 'create-account'] },
            { id: 'twitter', name: 'X (Twitter)', icon: 'twitter', actions: ['follow', 'like', 'retweet', 'comment', 'create-account'] },
            { id: 'discord', name: 'Discord', icon: 'discord', actions: ['join-server', 'send-message', 'react', 'create-account'] },
            { id: 'facebook', name: 'Facebook', icon: 'facebook', actions: ['follow', 'like-page', 'like-post', 'comment', 'share', 'join-group', 'create-account'] },
            { id: 'spotify', name: 'Spotify', icon: 'spotify', actions: ['follow', 'play', 'save', 'playlist-add', 'create-account'] },
            { id: 'twitch', name: 'Twitch', icon: 'twitch', actions: ['follow', 'view', 'chat', 'subscribe', 'create-account'] },
            { id: 'google', name: 'Google', icon: 'google', actions: ['create-account'] }
        ];
    });

    ipcMain.handle('get-platform-accounts-count', () => {
        const counts = {};
        if (!fs.existsSync(ACCOUNTS_PATH)) return counts;
        try {
            const platforms = fs.readdirSync(ACCOUNTS_PATH);
            for (const plat of platforms) {
                const platDir = path.join(ACCOUNTS_PATH, plat);
                if (fs.statSync(platDir).isDirectory()) {
                    const files = fs.readdirSync(platDir).filter(f => f.endsWith('.json'));
                    counts[plat] = files.length;
                }
            }
        } catch (e) {}
        return counts;
    });
}

module.exports = { register };
