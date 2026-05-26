const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let isQuitting = false;

const APP_DATA_PATH = path.join(app.getPath('userData'), 'smm-data');
const ACCOUNTS_PATH = path.join(APP_DATA_PATH, 'accounts');
const PROXIES_PATH = path.join(APP_DATA_PATH, 'proxies');
const TASKS_PATH = path.join(APP_DATA_PATH, 'tasks');
const SESSIONS_PATH = path.join(APP_DATA_PATH, 'sessions');
const LOGS_PATH = path.join(APP_DATA_PATH, 'logs');
const CONFIG_PATH = path.join(APP_DATA_PATH, 'config.json');

function ensureDirectories() {
    const dirs = [APP_DATA_PATH, ACCOUNTS_PATH, PROXIES_PATH, TASKS_PATH, SESSIONS_PATH, LOGS_PATH];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
    if (!fs.existsSync(CONFIG_PATH)) {
        const defaultConfig = {
            maxConcurrentBrowsers: 5,
            defaultHeadless: true,
            proxyTimeout: 10000,
            taskRetryCount: 3,
            captchaSolverEnabled: true,
            smsTimeout: 120000,
            browserFingerprint: true,
            autoStartTasks: false,
            theme: 'dark',
            language: 'en',
            notifications: true,
            minimizeToTray: true,
            startWithSystem: false,
            logLevel: 'info',
            apiEndpoint: '',
            workerName: 'Worker-' + Math.random().toString(36).substring(2, 8).toUpperCase()
        };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
    }
}

function loadConfig() {
    try {
        const data = fs.readFileSync(CONFIG_PATH, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function createMainWindow() {
    const config = loadConfig();

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        frame: false,
        transparent: false,
        backgroundColor: '#0a0a0f',
        titleBarStyle: 'hidden',
        titleBarOverlay: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
            webSecurity: false
        },
        show: false,
        icon: path.join(__dirname, '..', '..', 'assets', 'icon.png')
    });

    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        if (process.argv.includes('--dev')) {
            mainWindow.webContents.openDevTools();
        }
    });

    mainWindow.on('close', (event) => {
        if (!isQuitting && config.minimizeToTray) {
            event.preventDefault();
            mainWindow.hide();
            return false;
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window-state-changed', { maximized: true });
    });

    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window-state-changed', { maximized: false });
    });
}

function createTray() {
    const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
    let trayIcon;
    try {
        trayIcon = nativeImage.createFromPath(iconPath);
        trayIcon = trayIcon.resize({ width: 16, height: 16 });
    } catch (e) {
        trayIcon = nativeImage.createEmpty();
    }

    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show SMM Service',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Dashboard',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.webContents.send('navigate', 'dashboard');
                }
            }
        },
        {
            label: 'Tasks',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.webContents.send('navigate', 'tasks');
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('SMM Service - Running');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

app.whenReady().then(() => {
    ensureDirectories();
    createMainWindow();
    createTray();
    require('./ipc-handlers').register(ipcMain, mainWindow, {
        APP_DATA_PATH,
        ACCOUNTS_PATH,
        PROXIES_PATH,
        TASKS_PATH,
        SESSIONS_PATH,
        LOGS_PATH,
        CONFIG_PATH
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

app.on('before-quit', () => {
    isQuitting = true;
});

ipcMain.handle('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.handle('window-close', () => {
    if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('get-app-path', () => {
    return APP_DATA_PATH;
});

ipcMain.handle('open-external', (event, url) => {
    shell.openExternal(url);
});

ipcMain.handle('open-folder', (event, folderPath) => {
    shell.openPath(folderPath);
});

ipcMain.handle('select-file', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }]
    });
    return result;
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return result;
});

process.on('uncaughtException', (error) => {
    const logFile = path.join(LOGS_PATH, 'crash-' + Date.now() + '.log');
    fs.writeFileSync(logFile, error.stack || error.message);
});

process.on('unhandledRejection', (reason) => {
    const logFile = path.join(LOGS_PATH, 'rejection-' + Date.now() + '.log');
    fs.writeFileSync(logFile, String(reason));
});
