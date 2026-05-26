const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const activeEmails = new Map();

function getProviders() {
    return [
        { id: '1secmail', name: '1SecMail (100% FREE Temp Mail)' }
    ];
}

async function getNumber(providerId, country = '0', service = 'all') { // Kept 'getNumber' name for compatibility, but it gets an EMAIL
    try {
        const res = await axios.get('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1');
        if (res.data && res.data.length > 0) {
            const email = res.data[0];
            const [login, domain] = email.split('@');
            
            const id = uuidv4();
            activeEmails.set(id, {
                login,
                domain,
                number: email, // use 'number' property name for compatibility
                createdAt: Date.now()
            });
            
            return { success: true, number: email, id: id };
        }
        return { success: false, error: 'Failed to generate 1secmail' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function checkSms(providerId, numberId) { // Checks email instead of SMS
    const emailInfo = activeEmails.get(numberId);
    if (!emailInfo) return { success: false, error: 'Email session expired' };

    try {
        const res = await axios.get(`https://www.1secmail.com/api/v1/?action=getMessages&login=${emailInfo.login}&domain=${emailInfo.domain}`);
        const messages = res.data;
        
        if (messages && messages.length > 0) {
            // Get the first (latest) message body
            const msgId = messages[0].id;
            const msgRes = await axios.get(`https://www.1secmail.com/api/v1/?action=readMessage&login=${emailInfo.login}&domain=${emailInfo.domain}&id=${msgId}`);
            
            const textBody = msgRes.data.textBody || msgRes.data.htmlBody || messages[0].subject;
            
            // Basic regex to find verification codes (4 to 8 digits)
            const codeMatch = textBody.match(/\b\d{4,8}\b/);
            const code = codeMatch ? codeMatch[0] : null;

            return {
                success: true,
                messages: [
                    { 
                        from: messages[0].from, 
                        time: messages[0].date, 
                        body: textBody 
                    }
                ],
                code: code // Extracted code if found
            };
        } else {
            return {
                success: true,
                messages: [
                    { from: 'System', time: new Date().toLocaleTimeString(), body: `Waiting for Verification Code on ${emailInfo.number}...` }
                ]
            };
        }
    } catch(e) {
        return { success: false, error: e.message };
    }
}

function releaseNumber(numberId) {
    activeEmails.delete(numberId);
    return { success: true };
}

// Cleanup old activation requests
setInterval(() => {
    const now = Date.now();
    for (const [id, info] of activeEmails.entries()) {
        if (now - info.createdAt > 3600000) { // 1 Hour limit on temp mail
            activeEmails.delete(id);
        }
    }
}, 60000);

module.exports = {
    getProviders,
    getNumber,
    checkSms,
    releaseNumber
};
