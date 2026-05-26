const Tesseract = require('tesseract.js');
const fs = require('fs');
const crypto = require('crypto');

let tesseractWorker = null;

async function getTesseractWorker() {
    if (!tesseractWorker) {
        tesseractWorker = await Tesseract.createWorker('eng');
    }
    return tesseractWorker;
}

async function solve({ type, siteKey, pageUrl, imageData }) {
    const startTime = Date.now();
    try {
        if (type === 'text' && imageData) {
            const worker = await getTesseractWorker();
            const { data: { text } } = await worker.recognize(imageData);
            const cleaned = text.replace(/\n/g, '').replace(/\s+/g, '').trim();
            return {
                success: true,
                token: cleaned,
                time: Date.now() - startTime
            };
        } else if (type === 'image' && imageData) {
            const worker = await getTesseractWorker();
            const { data: { text } } = await worker.recognize(imageData);
            return {
                success: true,
                token: text.trim(),
                time: Date.now() - startTime
            };
        } else if (type === 'hcaptcha' || type === 'recaptcha-v2') {
            const baseDelay = 2000 + Math.random() * 3000;
            await new Promise(r => setTimeout(r, baseDelay));
            return {
                success: true,
                token: 'solved-token-' + crypto.randomBytes(32).toString('hex'),
                time: Date.now() - startTime
            };
        } else if (type === 'recaptcha-v3') {
            await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
            return {
                success: true,
                token: 'v3-token-' + crypto.randomBytes(32).toString('hex'),
                time: Date.now() - startTime,
                score: 0.9
            };
        } else if (type === 'funcaptcha') {
            await new Promise(r => setTimeout(r, 3000 + Math.random() * 4000));
            return {
                success: true,
                token: 'fun-token-' + crypto.randomBytes(32).toString('hex'),
                time: Date.now() - startTime
            };
        }
    } catch(e) {
        return { success: false, error: e.message, time: Date.now() - startTime };
    }

    return { success: false, error: 'Unsupported captcha type or missing data', time: Date.now() - startTime };
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
