const fs = require('fs');
const path = require('path');
const { fetch } = require('node-fetch');
const ProxyAgent = require('https-proxy-agent');
const SocksProxyAgent = require('socks-proxy-agent');

async function checkProxy(proxy) {
    const start = Date.now();
    try {
        let agent;
        const proxyUrl = `${proxy.type}://${proxy.username && proxy.password ? `${proxy.username}:${proxy.password}@` : ''}${proxy.host}:${proxy.port}`;
        
        if (proxy.type.startsWith('socks')) {
            agent = new SocksProxyAgent.SocksProxyAgent(proxyUrl);
        } else {
            agent = new ProxyAgent.HttpsProxyAgent(proxyUrl);
        }

        // We use node-fetch to dynamically import it later if needed, or axios if it's already installed
        const axios = require('axios');
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
                country: response.data.country
            };
        }
    } catch (e) {
        // Proxy failed
    }

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
            // Sort by response time or pick randomly for rotation
            const randomProxy = aliveProxies[Math.floor(Math.random() * aliveProxies.length)];
            return randomProxy;
        }
    } catch(e) {}
    return null;
}

module.exports = {
    checkProxy,
    getBestProxy
};
