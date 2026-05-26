const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const activeNumbers = new Map();

// Load SMS-Activate API Key
function getApiKey() {
    try {
        const configPath = path.join(process.env.APPDATA || process.env.HOME, 'smm-data', 'settings.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return config.smsApiKey || null;
        }
    } catch (e) {}
    return null;
}

function getProviders() {
    return [
        { id: 'sms-activate', name: 'SMS-Activate.org (PAID)' }
    ];
}

async function getNumber(providerId, country = '0', service = 'ig') {
    const apiKey = getApiKey();
    if (!apiKey) return { success: false, error: 'SMS_API_KEY_MISSING' };

    try {
        // SMS Activate API: getNumberV2 or getNumber
        const res = await axios.get(`https://api.sms-activate.org/stubs/handler_api.php?api_key=${apiKey}&action=getNumber&service=${service}&country=${country}`);
        const data = res.data;
        
        if (data.includes('ACCESS_NUMBER')) {
            const parts = data.split(':');
            const activationId = parts[1];
            const phoneNumber = parts[2];
            
            const id = uuidv4();
            activeNumbers.set(id, {
                activationId: activationId,
                number: '+' + phoneNumber,
                createdAt: Date.now()
            });
            
            return { success: true, number: '+' + phoneNumber, id: id };
        } else {
            return { success: false, error: `SMS-Activate Error: ${data}` };
        }
    } catch(e) {
        return { success: false, error: 'Failed to contact SMS API: ' + e.message };
    }
}

async function checkSms(providerId, numberId) {
    const numberInfo = activeNumbers.get(numberId);
    if (!numberInfo) return { success: false, error: 'Number session expired' };

    const apiKey = getApiKey();
    if (!apiKey) return { success: false, error: 'SMS_API_KEY_MISSING' };

    try {
        const res = await axios.get(`https://api.sms-activate.org/stubs/handler_api.php?api_key=${apiKey}&action=getStatus&id=${numberInfo.activationId}`);
        const data = res.data;
        
        if (data.startsWith('STATUS_OK')) {
            const code = data.split(':')[1];
            return {
                success: true,
                messages: [
                    { from: 'SMS-Activate', time: new Date().toLocaleTimeString(), body: code }
                ],
                code: code
            };
        } else if (data === 'STATUS_WAIT_CODE') {
            return {
                success: true,
                messages: [
                    { from: 'System', time: new Date().toLocaleTimeString(), body: `Waiting for SMS on ${numberInfo.number}...` }
                ]
            };
        } else {
            return { success: false, error: `Status: ${data}` };
        }
    } catch(e) {
        return { success: false, error: e.message };
    }
}

async function releaseNumber(numberId) {
    const numberInfo = activeNumbers.get(numberId);
    if (!numberInfo) return { success: true };

    const apiKey = getApiKey();
    if (apiKey) {
        try {
            // Cancel activation (status 8)
            await axios.get(`https://api.sms-activate.org/stubs/handler_api.php?api_key=${apiKey}&action=setStatus&status=8&id=${numberInfo.activationId}`);
        } catch(e) {}
    }
    
    activeNumbers.delete(numberId);
    return { success: true };
}

// Cleanup old activation requests
setInterval(() => {
    const now = Date.now();
    for (const [id, info] of activeNumbers.entries()) {
        if (now - info.createdAt > 1200000) { // 20 minutes limit on SMS-Activate
            releaseNumber(id);
        }
    }
}, 60000);

module.exports = {
    getProviders,
    getNumber,
    checkSms,
    releaseNumber
};
