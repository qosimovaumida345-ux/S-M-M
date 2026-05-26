const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function checkProxy(proxy) {
    const start = Date.now();
    try {
        const proxyUrl = `${proxy.type || 'http'}://${proxy.username && proxy.password ? `${proxy.username}:${proxy.password}@` : ''}${proxy.host}:${proxy.port}`;

        let agent;
        const proxyType = (proxy.type || 'http').toLowerCase();

        if (proxyType.startsWith('socks')) {
            const { SocksProxyAgent } = require('socks-proxy-agent');
            agent = new SocksProxyAgent(proxyUrl);
        } else {
            const { HttpsProxyAgent } = require('https-proxy-agent');
            agent = new HttpsProxyAgent(proxyUrl);
        }

        const response = await axios.get('http://ip-api.com/json', {
            httpAgent: agent,
            httpsAgent: agent,
            timeout: 10000
        });

        const time = Date.now() - start;

        if (response.data && response.data.status === 'success') {
            return {
                alive: true,
                responseTime: time,
                country: response.data.country,
                ip: response.data.query
            };
        }
    } catch (e) {}

    return {
        alive: false,
        responseTime: Date.now() - start,
        country: 'Unknown'
    };
}

async function getBestProxy(paths) {
    const proxyFile = path.join(paths.PROXIES_PATH, 'proxies.json');
    if (!fs.existsSync(proxyFile)) return null;
    try {
        const proxies = JSON.parse(fs.readFileSync(proxyFile, 'utf8'));
        const aliveProxies = proxies.filter(p => p.status === 'alive');
        if (aliveProxies.length > 0) {
            const randomProxy = aliveProxies[Math.floor(Math.random() * aliveProxies.length)];
            return randomProxy;
        }
        if (proxies.length > 0) {
            const unchecked = proxies.filter(p => p.status === 'unchecked');
            if (unchecked.length > 0) {
                return unchecked[Math.floor(Math.random() * unchecked.length)];
            }
        }
    } catch(e) {}
    return null;
}

module.exports = {
    checkProxy,
    getBestProxy
};
