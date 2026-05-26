let chromium;
let stealthApplied = false;

function getChromium() {
    if (chromium) return chromium;
    try {
        chromium = require('playwright-extra').chromium;
        const stealthPlugin = require('puppeteer-extra-plugin-stealth')();
        chromium.use(stealthPlugin);
        stealthApplied = true;
    } catch (e) {
        try {
            chromium = require('playwright').chromium;
        } catch (e2) {
            throw new Error('Neither playwright-extra nor playwright is installed');
        }
    }
    return chromium;
}

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
];

const VIEWPORTS = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 }
];

function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomViewport() {
    return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
}

async function launchBrowser(proxy, headless = true) {
    const browser_engine = getChromium();

    const launchOptions = {
        headless: headless,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--lang=en-US,en'
        ]
    };

    if (proxy) {
        const proxyType = (proxy.type || 'http').toLowerCase();
        launchOptions.proxy = {
            server: `${proxyType}://${proxy.host}:${proxy.port}`,
        };
        if (proxy.username && proxy.password) {
            launchOptions.proxy.username = proxy.username;
            launchOptions.proxy.password = proxy.password;
        }
    }

    try {
        const browser = await browser_engine.launch(launchOptions);
        const viewport = getRandomViewport();
        const context = await browser.newContext({
            viewport: viewport,
            userAgent: getRandomUA(),
            ignoreHTTPSErrors: true,
            locale: 'en-US',
            timezoneId: 'America/New_York',
            permissions: ['geolocation'],
            geolocation: { longitude: -73.935242, latitude: 40.730610 },
            colorScheme: 'dark',
            javaScriptEnabled: true,
        });

        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            window.chrome = { runtime: {} };
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) =>
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(parameters);
        });

        return { browser, context };
    } catch (e) {
        throw new Error(`Failed to launch browser: ${e.message}`);
    }
}

module.exports = {
    launchBrowser
};
