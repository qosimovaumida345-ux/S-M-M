const axios = require('axios');
const fs = require('fs');
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') }); } catch(e) {}

// ============================================================
// REAL PAID SMS VERIFICATION API 
// Supports: SMS-Activate.org / 5sim.net
// Required for Telegram, TikTok, Instagram, Google
// ============================================================

const activePhones = new Map();

function getSmsApiKey() {
    if (process.env.SMS_API_KEY) return process.env.SMS_API_KEY;
    try {
        const configPath = path.join(process.env.APPDATA || process.env.HOME, 'smm-data', 'settings.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.smsApiKey) return config.smsApiKey;
        }
    } catch (e) {}
    return null;
}

function getProvider() {
    // Default to sms-activate for now. Could be configurable.
    return 'smsactivate';
}

/**
 * Rent a phone number from SMS-Activate
 * @param {string} service - e.g. 'tg' (Telegram), 'ig' (Instagram), 'go' (Google)
 * @param {string} country - Country ID (0 = Russia, etc)
 */
async function getNumber(service = 'tg', country = '0') {
    const apiKey = getSmsApiKey();
    if (!apiKey) return { success: false, error: 'SMS_API_KEY_MISSING' };

    try {
        // Example for sms-activate: https://sms-activate.org/stubs/handler_api.php?api_key=$api_key&action=getNumber&service=$service&operator=any&country=$country
        const res = await axios.get(`https://sms-activate.org/stubs/handler_api.php`, {
            params: {
                api_key: apiKey,
                action: 'getNumber',
                service: service,
                country: country
            },
            timeout: 10000
        });

        // Response format: ACCESS_NUMBER:$id:$number
        const data = res.data;
        if (typeof data === 'string' && data.startsWith('ACCESS_NUMBER:')) {
            const parts = data.split(':');
            const id = parts[1];
            let number = parts[2];
            if (!number.startsWith('+')) number = '+' + number;
            
            activePhones.set(id, { id, number, service, status: 'WAITING', createdAt: Date.now() });
            
            return { success: true, id, number };
        } else {
            return { success: false, error: `SMS API Error: ${data}` };
        }
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Check if SMS has arrived
 */
async function checkSms(id) {
    const apiKey = getSmsApiKey();
    if (!apiKey) return { success: false, error: 'SMS_API_KEY_MISSING' };
    if (!activePhones.has(id)) return { success: false, error: 'Session not found' };

    const phoneData = activePhones.get(id);

    try {
        const res = await axios.get(`https://sms-activate.org/stubs/handler_api.php`, {
            params: {
                api_key: apiKey,
                action: 'getStatus',
                id: id
            },
            timeout: 8000
        });

        const data = res.data;
        
        // STATUS_WAIT_CODE
        // STATUS_OK:$code
        if (data.startsWith('STATUS_OK:')) {
            const code = data.split(':')[1];
            phoneData.status = 'RECEIVED';
            phoneData.code = code;
            
            // Tell server we received it successfully (Status 6)
            axios.get(`https://sms-activate.org/stubs/handler_api.php?api_key=${apiKey}&action=setStatus&status=6&id=${id}`).catch(()=>{});
            
            return { success: true, code, status: 'RECEIVED' };
        } else if (data === 'STATUS_WAIT_CODE') {
            return { success: true, code: null, status: 'WAITING' };
        } else {
            return { success: false, error: `Wait API Error: ${data}` };
        }
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Cancel the number if we don't need it or it didn't work (saves money)
 */
async function cancelNumber(id) {
    const apiKey = getSmsApiKey();
    if (!apiKey || !activePhones.has(id)) return;
    
    try {
        // Status 8 = cancel activation
        await axios.get(`https://sms-activate.org/stubs/handler_api.php`, {
            params: {
                api_key: apiKey,
                action: 'setStatus',
                status: 8,
                id: id
            }
        });
        activePhones.delete(id);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// Cleanup old activation requests (20 mins limit usually)
setInterval(() => {
    const now = Date.now();
    for (const [id, info] of activePhones.entries()) {
        if (now - info.createdAt > 20 * 60 * 1000) {
            cancelNumber(id);
        }
    }
}, 60000);

module.exports = {
    getNumber,
    checkSms,
    cancelNumber,
    getSmsApiKey
};
