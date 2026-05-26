const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const browser = require('./browser');
const proxyManager = require('./proxy-manager');

const activeTasks = new Map();

function getPlatformModule(platformName) {
    try {
        return require(`../platforms/${platformName}`);
    } catch (e) {
        return null;
    }
}

function readJson(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) {}
    return null;
}

function writeJson(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (e) {}
}

function saveTaskProgress(task, paths) {
    try {
        const taskFile = path.join(paths.TASKS_PATH, task.id + '.json');
        writeJson(taskFile, task);
    } catch (e) {}
}

function logToFile(paths, message) {
    try {
        const logFile = path.join(paths.LOGS_PATH, `engine-${new Date().toISOString().split('T')[0]}.log`);
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
    } catch (e) {}
}

async function executeTask(task, paths, progressCallback) {
    if (activeTasks.has(task.id)) return;

    activeTasks.set(task.id, { stopRequested: false });
    logToFile(paths, `Starting task ${task.id} - ${task.action} on ${task.platform}`);

    const accountsPath = path.join(paths.ACCOUNTS_PATH, task.platform);
    let accounts = [];
    if (fs.existsSync(accountsPath)) {
        const files = fs.readdirSync(accountsPath).filter(f => f.endsWith('.json'));
        for (const f of files) {
            try {
                const acc = JSON.parse(fs.readFileSync(path.join(accountsPath, f), 'utf8'));
                if (acc) accounts.push(acc);
            } catch (e) {}
        }
    }

    const platformModule = getPlatformModule(task.platform);

    if (!platformModule) {
        task.status = 'failed';
        task.logs = task.logs || [];
        task.logs.push(`Platform module "${task.platform}" not found`);
        task.failed = task.count || 0;
        progressCallback(task);
        saveTaskProgress(task, paths);
        activeTasks.delete(task.id);
        logToFile(paths, `Task ${task.id} failed: platform module not found`);
        return;
    }

    if (task.action === 'create-account') {
        await runCreateAccounts(task, platformModule, paths, progressCallback);
        return;
    }

    const activeAccs = accounts.filter(a => a.status === 'active');
    task.logs = task.logs || [];

    if (activeAccs.length === 0) {
        task.status = 'failed';
        task.logs.push('No active accounts available for this platform');
        progressCallback(task);
        saveTaskProgress(task, paths);
        activeTasks.delete(task.id);
        return;
    }

    const count = Math.min(task.count || activeAccs.length, activeAccs.length);

    if (activeAccs.length < (task.count || 0)) {
        task.logs.push(`Warning: Only ${activeAccs.length} active accounts available, requested ${task.count}`);
    }

    for (let i = 0; i < count; i++) {
        const taskState = activeTasks.get(task.id);
        if (!taskState || taskState.stopRequested) {
            task.status = 'stopped';
            progressCallback(task);
            saveTaskProgress(task, paths);
            activeTasks.delete(task.id);
            return;
        }

        const account = activeAccs[i];
        let proxy = null;

        if (task.useProxy) {
            proxy = await proxyManager.getBestProxy(paths);
            if (!proxy) {
                task.logs.push('No proxies available, using direct connection');
            }
        }

        try {
            const result = await platformModule.executeAction(task.action, account, task, proxy, paths);

            if (result.success) {
                task.completed = (task.completed || 0) + 1;
                task.logs.push(`[OK] ${task.action} with ${account.username || account.email || 'Account_' + i}`);
            } else {
                task.failed = (task.failed || 0) + 1;
                task.logs.push(`[FAIL] ${task.action} with ${account.username || 'Account_' + i}: ${result.error}`);
            }
        } catch (e) {
            task.failed = (task.failed || 0) + 1;
            task.logs.push(`[ERROR] ${task.action}: ${e.message}`);
        }

        task.progress = Math.round(((i + 1) / count) * 100);
        progressCallback(task);
        saveTaskProgress(task, paths);

        const delay = task.delay || (1000 + Math.floor(Math.random() * 2000));
        if (i < count - 1) {
            await new Promise(r => setTimeout(r, delay));
        }
    }

    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    progressCallback(task);
    saveTaskProgress(task, paths);
    activeTasks.delete(task.id);
    logToFile(paths, `Task ${task.id} completed: ${task.completed} done, ${task.failed} failed`);
}

async function runCreateAccounts(task, platformModule, paths, progressCallback) {
    task.logs = task.logs || [];
    const count = task.count || 1;

    for (let i = 0; i < count; i++) {
        const taskState = activeTasks.get(task.id);
        if (!taskState || taskState.stopRequested) {
            task.status = 'stopped';
            progressCallback(task);
            saveTaskProgress(task, paths);
            activeTasks.delete(task.id);
            return;
        }

        let proxy = null;
        if (task.useProxy) {
            proxy = await proxyManager.getBestProxy(paths);
        }

        try {
            const result = await platformModule.executeAction('create-account', null, task, proxy, paths);

            if (result.success) {
                task.completed = (task.completed || 0) + 1;
                const createdAccName = (result.account && (result.account.username || result.account.email)) ? (result.account.username || result.account.email) : 'Account';
                task.logs.push(`[OK] Created: ${createdAccName}`);
            } else {
                task.failed = (task.failed || 0) + 1;
                task.logs.push(`[ERROR] Account creation failed, skipping to next... Reason: ${result.error || 'Blocked by Anti-Bot'}`);
                continue; // Skip to the next iteration (Volume Strategy)
            }

            const accountObj = {
                id: uuidv4(),
                platform: task.platform,
                username: result.account.username || '',
                password: result.account.password || '',
                email: result.account.email || '',
                phone: result.account.phone || '',
                proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const platDir = path.join(paths.ACCOUNTS_PATH, task.platform);
            if (!fs.existsSync(platDir)) fs.mkdirSync(platDir, { recursive: true });
            writeJson(path.join(platDir, accountObj.id + '.json'), accountObj);

        } catch (e) {
            task.failed = (task.failed || 0) + 1;
            task.logs.push(`[ERROR] Account ${i + 1}: ${e.message}`);
        }

        task.progress = Math.round(((i + 1) / count) * 100);
        progressCallback(task);
        saveTaskProgress(task, paths);

        const delay = task.delay || (3000 + Math.floor(Math.random() * 5000));
        if (i < count - 1) {
            await new Promise(r => setTimeout(r, delay));
        }
    }

    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    progressCallback(task);
    saveTaskProgress(task, paths);
    activeTasks.delete(task.id);
    logToFile(paths, `Account creation task ${task.id} completed: ${task.completed} created, ${task.failed} failed`);
}

function stopTask(taskId) {
    if (activeTasks.has(taskId)) {
        activeTasks.get(taskId).stopRequested = true;
    }
}

function createAccounts(task, paths, progressCallback) {
    const platformModule = getPlatformModule(task.platform);
    if (!platformModule) {
        task.status = 'failed';
        task.logs = task.logs || [];
        task.logs.push(`Platform module "${task.platform}" not found`);
        task.failed = task.count || 0;
        progressCallback(task);
        saveTaskProgress(task, paths);
        return;
    }

    activeTasks.set(task.id, { stopRequested: false });
    runCreateAccounts(task, platformModule, paths, progressCallback);
}

module.exports = {
    executeTask,
    stopTask,
    createAccounts
};
