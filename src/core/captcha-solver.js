const Tesseract = require('tesseract.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') }); } catch(e) {}

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

// Groq API Key: reads from .env file (GROQ_API_KEY=xxx)
function getGroqApiKey() {
    // Priority 1: Environment variable (.env file)
    if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
    // Priority 2: Settings file
    try {
        const configPath = path.join(process.env.APPDATA || process.env.HOME, 'smm-data', 'settings.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.groqApiKey) return config.groqApiKey;
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


async function solveVisionWithGroq(base64Image, instructionText, gridType = '3x3') {
    const apiKey = getGroqApiKey();
    if (!apiKey) return { success: false, error: 'GROQ_API_KEY_MISSING' };
    
    // Instruction string forcing JSON output
    const prompt = `You are an expert captcha solver. Look at the provided image grid (${gridType}).
The user needs to select: "${instructionText}".
The grid is numbered 1 to ${gridType === '3x3' ? '9' : '16'} from top-left to bottom-right.
Output ONLY a raw JSON array containing the integer numbers of the cells that feature the requested object. If none, output []. Do not output any markdown formatting, backticks, or other text.`;

    try {
        const startTime = Date.now();
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.2-11b-vision-preview',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            {
                                type: 'image_url',
                                image_url: { url: `data:image/jpeg;base64,${base64Image}` }
                            }
                        ]
                    }
                ],
                max_tokens: 25,
                temperature: 0.1
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000 // fail fast if Groq is overloaded
            }
        );

        let content = response.data.choices[0].message.content.trim();
        
        // Clean up markdown block if AI still includes it
        if (content.startsWith('```')) {
            content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        }
        
        let clicks = [];
        try {
            clicks = JSON.parse(content);
            if (!Array.isArray(clicks)) clicks = [];
        } catch (e) {
            // Regex fallback if AI just replies with "1, 4, 5"
            const match = content.match(/\d+/g);
            if (match) clicks = match.map(Number);
        }

        return { success: true, clicks: clicks, time: Date.now() - startTime };
    } catch (e) {
        return { success: false, error: e.response ? JSON.stringify(e.response.data) : e.message };
    }
}

module.exports = {
    solve,
    solveVisionWithGroq,
    cleanup
};
