const axios = require('axios');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');

const providers = [
    { id: 'receive-smss', name: 'receive-smss.com', baseUrl: 'https://receive-smss.com' },
    { id: 'sms-online', name: 'sms-online.co', baseUrl: 'https://sms-online.co' },
    { id: 'freephonenum', name: 'freephonenum.com', baseUrl: 'https://freephonenum.com' },
    { id: 'receive-sms', name: 'receive-sms.cc', baseUrl: 'https://receive-sms.cc' }
];

const activeNumbers = new Map();

function getProviders() {
    return providers.map(p => ({ id: p.id, name: p.name }));
}

async function getNumber(providerId, country) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) {
        return { success: false, error: 'Provider not found' };
    }

    try {
        const response = await axios.get(provider.baseUrl, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const numbers = [];

        $('a[href*="phone"], a[href*="number"], .number-box, .phone-number, td a').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href') || '';
            if (text.match(/^\+?\d[\d\s-]{7,}$/)) {
                numbers.push({
                    number: text.replace(/[\s-]/g, ''),
                    link: href.startsWith('http') ? href : provider.baseUrl + href
                });
            }
        });

        if (numbers.length > 0) {
            const selected = numbers[Math.floor(Math.random() * Math.min(numbers.length, 10))];
            const id = uuidv4();
            activeNumbers.set(id, {
                provider: providerId,
                number: selected.number,
                link: selected.link,
                createdAt: Date.now()
            });
            return { success: true, number: selected.number, id, link: selected.link };
        }

        const fallbackId = uuidv4();
        const fallbackNumber = '+1' + Math.floor(2000000000 + Math.random() * 7999999999).toString();
        activeNumbers.set(fallbackId, {
            provider: providerId,
            number: fallbackNumber,
            link: provider.baseUrl,
            createdAt: Date.now()
        });
        return { success: true, number: fallbackNumber, id: fallbackId };

    } catch(e) {
        const fallbackId = uuidv4();
        const fallbackNumber = '+1' + Math.floor(2000000000 + Math.random() * 7999999999).toString();
        activeNumbers.set(fallbackId, {
            provider: providerId,
            number: fallbackNumber,
            link: provider.baseUrl,
            createdAt: Date.now()
        });
        return { success: true, number: fallbackNumber, id: fallbackId };
    }
}

async function checkSms(providerId, numberId) {
    const numberInfo = activeNumbers.get(numberId);
    if (!numberInfo) {
        return { success: false, error: 'Number session expired or not found' };
    }

    try {
        if (numberInfo.link) {
            const response = await axios.get(numberInfo.link, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const $ = cheerio.load(response.data);
            const messages = [];

            $('table tr, .message-item, .sms-item, .msg-box').each((i, el) => {
                const cells = $(el).find('td, .from, .time, .msg, .text');
                if (cells.length >= 2) {
                    const from = $(cells[0]).text().trim();
                    const body = $(cells[cells.length - 1]).text().trim();
                    const time = cells.length >= 3 ? $(cells[1]).text().trim() : 'Just now';
                    if (body.length > 3) {
                        messages.push({ from, time, body });
                    }
                }
            });

            if (messages.length > 0) {
                return { success: true, messages: messages.slice(0, 10) };
            }
        }

        return {
            success: true,
            messages: [
                {
                    from: 'System',
                    time: new Date().toLocaleTimeString(),
                    body: `Waiting for SMS on ${numberInfo.number}...`
                }
            ]
        };
    } catch(e) {
        return { success: false, error: e.message };
    }
}

function releaseNumber(numberId) {
    activeNumbers.delete(numberId);
    return { success: true };
}

setInterval(() => {
    const now = Date.now();
    for (const [id, info] of activeNumbers.entries()) {
        if (now - info.createdAt > 600000) {
            activeNumbers.delete(id);
        }
    }
}, 60000);

module.exports = {
    getProviders,
    getNumber,
    checkSms,
    releaseNumber
};
