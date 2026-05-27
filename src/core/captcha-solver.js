const Tesseract = require('tesseract.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') }); } catch(e) {}

let tesseractWorker = null;

// Groq API Key: reads from .env file (GROQ_API_KEY=xxx)
function getGroqApiKey() {
    if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
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

// Legacy solve (Text only via OCR)
async function solve({ type, imageData }) {
    const startTime = Date.now();
    try {
        if ((type === 'text' || type === 'image') && imageData) {
            const worker = await getTesseractWorker();
            const { data: { text } } = await worker.recognize(imageData);
            const cleaned = text.replace(/\\n/g, '').replace(/\\s+/g, '').trim();
            return { success: true, token: cleaned, time: Date.now() - startTime };
        }
        return { success: false, error: 'Groq Vision is handled visually via solvePlaywrightVisual. 2Captcha has been ripped out.' };
    } catch(e) {
        return { success: false, error: e.message, time: Date.now() - startTime };
    }
}

// =========================================================
// HACKER MODE: Universal Groq Vision AI Solver
// =========================================================
async function solveVisionWithGroq(base64Image, instructionText, gridType = '3x3') {
    const apiKey = getGroqApiKey();
    if (!apiKey) return { success: false, error: 'GROQ_API_KEY_MISSING_IN_SETTINGS' };
    
    let cellCount = 9;
    if (gridType === '4x4') cellCount = 16;
    if (gridType === '6-grid' || gridType === 'arkose') cellCount = 6;

    const prompt = `You are an expert captcha solver. Look at the provided image grid (${gridType}).
The user needs to select: "${instructionText}".
The grid is numbered 1 to ${cellCount} from top-left to bottom-right.
Output ONLY a raw JSON array containing the integer numbers of the cells that feature the requested object. If none, output []. Do not output any markdown formatting, backticks, or other text.`;

    try {
        const startTime = Date.now();
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.2-11b-vision-preview',
                messages: [
                    { role: 'user', content: [ { type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } } ] }
                ],
                max_tokens: 25,
                temperature: 0.1
            },
            { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 15000 }
        );

        let content = response.data.choices[0].message.content.trim();
        if (content.startsWith('```')) content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let clicks = [];
        try {
            clicks = JSON.parse(content);
            if (!Array.isArray(clicks)) clicks = [];
        } catch (e) {
            const match = content.match(/\d+/g);
            if (match) clicks = match.map(Number);
        }

        return { success: true, clicks: clicks, time: Date.now() - startTime };
    } catch (e) {
        return { success: false, error: e.response ? JSON.stringify(e.response.data) : e.message };
    }
}

// =========================================================
// MASTER PLAYWRIGHT CONTROLLER
// Detects and delegates to specific UI solvers
// =========================================================
async function solvePlaywrightVisual(page) {
    const isArkose = await page.locator('iframe[src*="arkose"], iframe[src*="funcaptcha"]').count() > 0;
    const isHcaptcha = await page.locator('iframe[src*="hcaptcha"], iframe[src*="recaptcha"]').count() > 0;
    const isTikTok = await page.locator('div[id*="captcha"], iframe[src*="captcha"]').count() > 0;

    if (isArkose) return await solveArkose(page);
    if (isHcaptcha) return await solveHcaptchaRecaptcha(page);
    if (isTikTok) return await solveHcaptchaRecaptcha(page); // Fallback for generic grids
    
    return { success: false, error: 'NO_SUPPORTED_CAPTCHA_FOUND' };
}

async function solveArkose(page) {
    try {
        let frame = page.frameLocator('iframe[src*="arkose"], iframe[src*="funcaptcha"]').first();
        if (await frame.locator('#fc-iframe-wrap').count() > 0) {
            frame = frame.frameLocator('#fc-iframe-wrap');
        }

        // Click verify button if present
        const verifyBtn = await frame.locator('button:has-text("Verify"), button:has-text("Start")');
        if (await verifyBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
            await verifyBtn.click();
            await page.waitForTimeout(2000);
        }

        for (let attempt = 0; attempt < 3; attempt++) {
            // Check if solved
            const solved = await frame.locator('.fc-nav-wrapper .checkmark, .victory-container').count() > 0;
            if (solved) return { success: true };

            const instructionText = await frame.locator('.challenge-instructions-text, h2').first().textContent().catch(() => '');
            if (!instructionText) continue;

            const gridElement = frame.locator('.challenge-container, #game-core').first();
            if (!(await gridElement.isVisible().catch(() => false))) break;

            const buffer = await gridElement.screenshot();
            const visionResult = await solveVisionWithGroq(buffer.toString('base64'), instructionText, 'arkose');
            
            if (!visionResult.success || !visionResult.clicks.length) {
                await frame.locator('#reload-button, .reload-btn').first().click().catch(()=> {});
                await page.waitForTimeout(2500);
                continue;
            }

            // Click Arkose grids/buttons. Often they are image fragments
            const cells = await gridElement.locator('a[role="button"], .image-button, .challenge-image').all();
            for (const num of visionResult.clicks) {
                if (num >= 1 && num <= cells.length) {
                    await cells[num - 1].click().catch(()=> {});
                    await page.waitForTimeout(1000);
                }
            }
            await page.waitForTimeout(3000); // Arkose takes time to process
        }
        
        return { success: false, error: 'MAX_ARKOSE_VISION_ROUNDS_REACHED' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function solveHcaptchaRecaptcha(page) {
    try {
        const checkboxFrame = page.frameLocator('iframe[src*="hcaptcha"][title*="widget"], iframe[src*="recaptcha"][title*="reCAPTCHA"]');
        if (await checkboxFrame.locator('.recaptcha-checkbox-border, #checkbox').first().isVisible({ timeout: 2000 }).catch(() => false)) {
            await checkboxFrame.locator('.recaptcha-checkbox-border, #checkbox').first().click();
            await page.waitForTimeout(2500);
        }
    } catch (e) {}

    let challengeFrame;
    try {
        challengeFrame = page.frameLocator('iframe[src*="hcaptcha"][title*="content"], iframe[src*="bframe"][title*="recaptcha payload"]');
        await challengeFrame.locator('.prompt-text, .rc-imageselect-instructions').first().waitFor({ state: 'visible', timeout: 5000 });
    } catch (e) {
        return { success: false, error: 'NO_VISIBLE_CAPTCHA_POPUP_FOUND' };
    }

    for (let attempt = 0; attempt < 3; attempt++) {
        const isSolved = await page.evaluate(() => {
            return (document.querySelector('[name="h-captcha-response"]')?.value?.length > 0) || 
                   (document.querySelector('[name="g-recaptcha-response"]')?.value?.length > 0);
        }).catch(() => false);
        if (isSolved) return { success: true };

        let instructionText = '';
        try { instructionText = await challengeFrame.locator('.prompt-text, .rc-imageselect-instructions').first().textContent(); } catch(e) { continue; }
        if (!instructionText) continue;

        const gridElement = challengeFrame.locator('.task-grid, .rc-imageselect-table').first();
        if (!(await gridElement.isVisible().catch(() => false))) break; 
        
        const buffer = await gridElement.screenshot();
        const base64 = buffer.toString('base64');
        const is3x3 = (await gridElement.locator('.task-image, .rc-image-tile-target').count()) === 9;
        const gridType = is3x3 ? '3x3' : '4x4';

        const visionResult = await solveVisionWithGroq(base64, instructionText, gridType);
        if (!visionResult.success || !visionResult.clicks.length) {
            await challengeFrame.locator('.refresh-button, #recaptcha-reload-button').first().click().catch(()=> {});
            await page.waitForTimeout(2500);
            continue;
        }

        const cells = await gridElement.locator('.task-image, .rc-image-tile-target').all();
        for (const num of visionResult.clicks) {
            if (num >= 1 && num <= cells.length) {
                await cells[num - 1].click().catch(()=> {});
                await page.waitForTimeout(300 + Math.random() * 400);
            }
        }

        await challengeFrame.locator('.button-submit, #recaptcha-verify-button').first().click().catch(()=> {});
        await page.waitForTimeout(4000); 
    }
    
    const isSolvedEnd = await page.evaluate(() => { return (document.querySelector('[name="h-captcha-response"]')?.value?.length > 0); }).catch(() => false);
    if (isSolvedEnd) return { success: true };
    return { success: false, error: 'MAX_VISION_ROUNDS_REACHED' };
}

async function cleanup() {
    if (tesseractWorker) {
        await tesseractWorker.terminate();
        tesseractWorker = null;
    }
}

module.exports = {
    solve,
    solveVisionWithGroq,
    solvePlaywrightVisual,
    cleanup
};
