const fs = require('fs');
const path = require('path');
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

async function executeTask(task, paths, progressCallback) {
    if (activeTasks.has(task.id)) return;
    
    activeTasks.set(task.id, { stopRequested: false });

    // Load available accounts for the platform
    const accountsPath = path.join(paths.ACCOUNTS_PATH, task.platform);
    let accounts = [];
    if (fs.existsSync(accountsPath)) {
        const files = fs.readdirSync(accountsPath).filter(f => f.endsWith('.json'));
        accounts = files.map(f => JSON.parse(fs.readFileSync(path.join(accountsPath, f), 'utf8')));
    }

    const platformModule = getPlatformModule(task.platform);
    
    if (!platformModule) {
        task.status = 'failed';
        task.logs.push(`Platform module ${task.platform} not found.`);
        task.failed = task.count;
        progressCallback(task);
        activeTasks.delete(task.id);
        return;
    }

    // Determine target accounts (based on count mapping)
    // For simplicity, we just use the first N active accounts
    const activeAccs = accounts.filter(a => a.status === 'active');
    if (activeAccs.length < task.count && task.action !== 'create-account') {
        task.logs.push(`Warning: Only ${activeAccs.length} active accounts available, but ${task.count} requested.`);
    }

    const targetAccs = activeAccs.slice(0, Math.min(task.count, activeAccs.length));
    
    if (targetAccs.length === 0 && task.action !== 'create-account') {
        task.status = 'failed';
        task.logs.push('No active accounts available for this task.');
        progressCallback(task);
        activeTasks.delete(task.id);
        return;
    }

    for (let i = 0; i < (task.action === 'create-account' ? task.count : targetAccs.length); i++) {
        if (activeTasks.get(task.id).stopRequested) {
            task.status = 'stopped';
            progressCallback(task);
            activeTasks.delete(task.id);
            return;
        }

        let account = targetAccs[i];
        let proxy = null;
        
        if (task.useProxy) {
            proxy = await proxyManager.getBestProxy(paths);
            if (!proxy) {
                task.logs.push('Warning: No proxies available, falling back to direct connection.');
            }
        }

        try {
            const result = await platformModule.executeAction(task.action, account, task, proxy, paths);
            
            if (result.success) {
                task.completed++;
                task.logs.push(`Successfully completed action ${task.action} with ${account ? account.username : `Account_${i}`}.`);
            } else {
                task.failed++;
                task.logs.push(`Failed action ${task.action} with ${account ? account.username : `Account_${i}`}: ${result.error}`);
            }
        } catch (e) {
            task.failed++;
            task.logs.push(`Error executing action ${task.action}: ${e.message}`);
        }

        task.progress = Math.round(((i + 1) / (task.action === 'create-account' ? task.count : targetAccs.length)) * 100);
        progressCallback(task);
        
        if (task.delay && i < (task.action === 'create-account' ? task.count : targetAccs.length) - 1) {
             await new Promise(r => setTimeout(r, task.delay));
        }
    }

    task.status = 'completed';
    progressCallback(task);
    activeTasks.delete(task.id);
}

function stopTask(taskId) {
    if (activeTasks.has(taskId)) {
        activeTasks.get(taskId).stopRequested = true;
    }
}

async function createAccounts(task, paths, progressCallback) {
    if (activeTasks.has(task.id)) return;
    
    activeTasks.set(task.id, { stopRequested: false });

    const platformModule = getPlatformModule(task.platform);
    if (!platformModule) {
        task.status = 'failed';
        task.logs.push(`Platform module ${task.platform} not found.`);
        task.failed = task.count;
        progressCallback(task);
        activeTasks.delete(task.id);
        return;
    }

    for (let i = 0; i < task.count; i++) {
        if (activeTasks.get(task.id).stopRequested) {
            task.status = 'stopped';
            progressCallback(task);
            activeTasks.delete(task.id);
            return;
        }

        let proxy = null;
        if (task.useProxy) {
            proxy = await proxyManager.getBestProxy(paths);
        }

        try {
            const result = await platformModule.executeAction('create-account', null, task, proxy, paths);
            
            if (result.success && result.account) {
                task.completed++;
                task.logs.push(`Successfully created account: ${result.account.username}`);
            } else {
                task.failed++;
                task.logs.push(`Failed to create account ${i+1}: ${result.error}`);
            }
        } catch (e) {
            task.failed++;
            task.logs.push(`Error creating account ${i+1}: ${e.message}`);
        }

        task.progress = Math.round(((i + 1) / task.count) * 100);
        progressCallback(task);
    }
    
    task.status = 'completed';
    progressCallback(task);
    activeTasks.delete(task.id);
}

module.exports = {
    executeTask,
    stopTask,
    createAccounts
};
