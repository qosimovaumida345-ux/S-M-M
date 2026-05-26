const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealthPlugin);

async function launchBrowser(proxy, headless = true) {
    const launchOptions = {
        headless: headless,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--window-size=1280,720',
        ]
    };

    if (proxy) {
        launchOptions.proxy = {
            server: `${proxy.type}://${proxy.host}:${proxy.port}`,
        };
        if (proxy.username && proxy.password) {
            launchOptions.proxy.username = proxy.username;
            launchOptions.proxy.password = proxy.password;
        }
    }

    try {
        const browser = await chromium.launch(launchOptions);
        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ignoreHTTPSErrors: true,
        });

        // Additional stealth configurations can be applied to context here
        return { browser, context };
    } catch (e) {
        throw new Error(`Failed to launch browser: ${e.message}`);
    }
}

module.exports = {
    launchBrowser
};
