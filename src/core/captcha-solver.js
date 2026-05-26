const Tesseract = require('tesseract.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

let tesseractWorker = null;

// The user must configure this API key in their environment or settings file later.
// For now, we load from a config file if it exists, otherwise it will fail explicitly.
function getApiKey() {
    try {
        const configPath = path.join(process.env.APPDATA || process.env.HOME, 'smm-data', 'settings.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return config.captchaApiKey || null;
        }
    } catch (e) {}
    return null;
}

async function getTesseractWorker() {
    if (!tesseractWorker) {
        tesseractWorker = await Tesseract.createWorker('eng');
    }
    return tesseractWorker;
}

// 2Captcha Real Integration
async function solve2Captcha(apiKey, type, siteKey, pageUrl) {
    let method = '';
    if (type === 'hcaptcha') method = 'hcaptcha';
    if (type === 'recaptcha-v2') method = 'userrecaptcha';
    if (type === 'recaptcha-v3') method = 'userrecaptcha&version=v3';
    if (type === 'funcaptcha') method = 'funcaptcha';
    
    // Create Task
    const createTaskResponse = await axios.get(`http://2captcha.com/in.php?key=${apiKey}&method=${method}&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
    if (createTaskResponse.data.status !== 1) {
        throw new Error(`2Captcha Error: ${createTaskResponse.data.request}`);
    }
    
    const taskId = createTaskResponse.data.request;
    
    // Poll for Result (typically takes 15-45 seconds for a real human/ai to solve)
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const resultResponse = await axios.get(`http://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`);
        if (resultResponse.data.status === 1) {
            return resultResponse.data.request;
        }
        if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
            throw new Error(`2Captcha Polling Error: ${resultResponse.data.request}`);
        }
    }
    throw new Error('2Captcha Time Out');
}

async function solve({ type, siteKey, pageUrl, imageData }) {
    const startTime = Date.now();
    try {
        if (type === 'text' && imageData) {
            const worker = await getTesseractWorker();
            const { data: { text } } = await worker.recognize(imageData);
            const cleaned = text.replace(/\\n/g, '').replace(/\\s+/g, '').trim();
            return { success: true, token: cleaned, time: Date.now() - startTime };
        } else if (type === 'image' && imageData) {
            const worker = await getTesseractWorker();
            const { data: { text } } = await worker.recognize(imageData);
            return { success: true, token: text.trim(), time: Date.now() - startTime };
        }

        const apiKey = getApiKey();
        if (!apiKey) {
             return { success: false, error: 'CAPTCHA_API_KEY_MISSING' };
        }

        const token = await solve2Captcha(apiKey, type, siteKey, pageUrl);
        return {
             success: true,
             token: token,
             time: Date.now() - startTime
        };

    } catch(e) {
        return { success: false, error: e.message, time: Date.now() - startTime };
    }
}

async function cleanup() {
    if (tesseractWorker) {
        await tesseractWorker.terminate();
        tesseractWorker = null;
    }
}

module.exports = {
    solve,
    cleanup
};
