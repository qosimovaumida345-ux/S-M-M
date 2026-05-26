const fs = require('fs');
const path = require('path');

// ============================================================
// STEALTH BROWSER ENGINE — Virtual Device Emulator
// Generates 100+ unique hardware fingerprints per session
// Spoofs: WebGL, Canvas, AudioContext, DeviceMemory, GPU, Screen
// ============================================================

let chromium;
try {
    chromium = require('playwright-extra').chromium;
    const stealth = require('puppeteer-extra-plugin-stealth')();
    chromium.use(stealth);
} catch (e) {
    chromium = require('playwright').chromium;
}

// ============================================================
// 100+ REAL DEVICE DATABASE
// ============================================================

const ANDROID_MODELS = [
    // Samsung Galaxy S Series
    { model: 'SM-S928B', name: 'Galaxy S24 Ultra', w: 412, h: 915, dpr: 3.5, gpu: 'Adreno (TM) 750', vendor: 'Qualcomm', mem: 12, cores: 8 },
    { model: 'SM-S918B', name: 'Galaxy S23 Ultra', w: 412, h: 915, dpr: 3, gpu: 'Adreno (TM) 740', vendor: 'Qualcomm', mem: 12, cores: 8 },
    { model: 'SM-S908B', name: 'Galaxy S22 Ultra', w: 412, h: 915, dpr: 3, gpu: 'Adreno (TM) 730', vendor: 'Qualcomm', mem: 12, cores: 8 },
    { model: 'SM-G998B', name: 'Galaxy S21 Ultra', w: 412, h: 915, dpr: 3, gpu: 'Adreno (TM) 660', vendor: 'Qualcomm', mem: 12, cores: 8 },
    { model: 'SM-G988B', name: 'Galaxy S20 Ultra', w: 412, h: 915, dpr: 3.5, gpu: 'Adreno (TM) 650', vendor: 'Qualcomm', mem: 12, cores: 8 },
    { model: 'SM-S926B', name: 'Galaxy S24+', w: 412, h: 915, dpr: 3, gpu: 'Adreno (TM) 750', vendor: 'Qualcomm', mem: 12, cores: 8 },
    { model: 'SM-S916B', name: 'Galaxy S23+', w: 412, h: 915, dpr: 3, gpu: 'Adreno (TM) 740', vendor: 'Qualcomm', mem: 8, cores: 8 },
    { model: 'SM-S906B', name: 'Galaxy S22+', w: 412, h: 915, dpr: 2.625, gpu: 'Adreno (TM) 730', vendor: 'Qualcomm', mem: 8, cores: 8 },
    { model: 'SM-S921B', name: 'Galaxy S24', w: 360, h: 780, dpr: 3, gpu: 'Adreno (TM) 750', vendor: 'Qualcomm', mem: 8, cores: 8 },
    { model: 'SM-S911B', name: 'Galaxy S23', w: 360, h: 780, dpr: 3, gpu: 'Adreno (TM) 740', vendor: 'Qualcomm', mem: 8, cores: 8 },
    { model: 'SM-S901B', name: 'Galaxy S22', w: 360, h: 780, dpr: 3, gpu: 'Adreno (TM) 730', vendor: 'Qualcomm', mem: 8, cores: 8 },
    { model: 'SM-G991B', name: 'Galaxy S21', w: 360, h: 800, dpr: 3, gpu: 'Adreno (TM) 660', vendor: 'Qualcomm', mem: 8, cores: 8 },
    // Samsung Galaxy A Series (Budget-Mid)
    { model: 'SM-A546B', name: 'Galaxy A54', w: 412, h: 915, dpr: 2.625, gpu: 'Mali-G68 MC4', vendor: 'ARM', mem: 8, cores: 8 },
    { model: 'SM-A536B', name: 'Galaxy A53', w: 412, h: 915, dpr: 2.625, gpu: 'Mali-G68 MC4', vendor: 'ARM', mem: 6, cores: 8 },
    { model: 'SM-A346B', name: 'Galaxy A34', w: 412, h: 915, dpr: 2.625, gpu: 'Mali-G68 MC4', vendor: 'ARM', mem: 6, cores: 8 },
    { model: 'SM-A256B', name: 'Galaxy A25', w: 384, h: 854, dpr: 2, gpu: 'Mali-G57 MC2', vendor: 'ARM', mem: 6, cores: 8 },
    { model: 'SM-A156B', name: 'Galaxy A15', w: 384, h: 854, dpr: 2, gpu: 'Mali-G57 MC2', vendor: 'ARM', mem: 4, cores: 8 },
    { model: 'SM-A057F', name: 'Galaxy A05s', w: 360, h: 800, dpr: 2, gpu: 'PowerVR GE8320', vendor: 'Imagination', mem: 4, cores: 8 },
    // Samsung Galaxy Z (Foldable)
    { model: 'SM-F946B', name: 'Galaxy Z Fold5', w: 360, h: 748, dpr: 3, gpu: 'Adreno (TM) 740', vendor: 'Qualcomm', mem: 12, cores: 8 },
    { model: 'SM-F731B', name: 'Galaxy Z Flip5', w: 412, h: 915, dpr: 3, gpu: 'Adreno (TM) 740', vendor: 'Qualcomm', mem: 8, cores: 8 },
    // Google Pixel
    { model: 'Pixel 8 Pro', name: 'Pixel 8 Pro', w: 412, h: 915, dpr: 3.5, gpu: 'Mali-G715 MC7', vendor: 'ARM', mem: 12, cores: 9 },
    { model: 'Pixel 8', name: 'Pixel 8', w: 412, h: 915, dpr: 2.625, gpu: 'Mali-G715 MC7', vendor: 'ARM', mem: 8, cores: 9 },
    { model: 'Pixel 7 Pro', name: 'Pixel 7 Pro', w: 412, h: 892, dpr: 3.5, gpu: 'Mali-G710 MC10', vendor: 'ARM', mem: 12, cores: 8 },
    { model: 'Pixel 7', name: 'Pixel 7', w: 412, h: 915, dpr: 2.625, gpu: 'Mali-G710 MC10', vendor: 'ARM', mem: 8, cores: 8 },
    { model: 'Pixel 7a', name: 'Pixel 7a', w: 412, h: 892, dpr: 2.625, gpu: 'Mali-G710 MC10', vendor: 'ARM', mem: 8, cores: 8 },
    { model: 'Pixel 6 Pro', name: 'Pixel 6 Pro', w: 412, h: 892, dpr: 3.5, gpu: 'Mali-G78 MP20', vendor: 'ARM', mem: 12, cores: 8 },
    { model: 'Pixel 6', name: 'Pixel 6', w: 412, h: 915, dpr: 2.625, gpu: 'Mali-G78 MP20', vendor: 'ARM', mem: 8, cores: 8 },
    { model: 'Pixel 6a', name: 'Pixel 6a', w: 412, h: 892, dpr: 2.625, gpu: 'Mali-G78 MP20', vendor: 'ARM', mem: 6, cores: 8 },
    // OnePlus
    { model: 'CPH2449', name: 'OnePlus 12', w: 412, h: 915, dpr: 3.5, gpu: 'Adreno (TM) 750', vendor: 'Qualcomm', mem: 16, cores: 8 },
    { model: 'PHB110', name: 'OnePlus 11', w: 412, h: 915, dpr: 3, gpu: 'Adreno (TM) 740', vendor: 'Qualcomm', mem: 16, cores: 8 },
    { model: 'NE2215', name: 'OnePlus 10 Pro', w: 412, h: 915, dpr: 3, gpu: 'Adreno (TM) 730', vendor: 'Qualcomm', mem: 12, cores: 8 },
    { model: 'CPH2423', name: 'OnePlus Nord 3', w: 412, h: 915, dpr: 2.75, gpu: 'Mali-G610 MC6', vendor: 'ARM', mem: 8, cores: 8 },
    { model: 'IV2201', name: 'OnePlus Nord CE 3', w: 393, h: 873, dpr: 2.75, gpu: 'Adreno (TM) 642L', vendor: 'Qualcomm', mem: 8, cores: 8 },
    // Xiaomi / Redmi / POCO
    { model: '2312DRA50G', name: 'Xiaomi 14 Ultra', w: 412, h: 915, dpr: 3.5, gpu: 'Adreno (TM) 750', vendor: 'Qualcomm', mem: 16, cores: 8 },
    { model: '2311DRK48C', name: 'Xiaomi 14', w: 393, h: 873, dpr: 3, gpu: 'Adreno (TM) 750', vendor: 'Qualcomm', mem: 12, cores: 8 },
    { model: '2210132G', name: 'Xiaomi 13', w: 393, h: 873, dpr: 3, gpu: 'Adreno (TM) 740', vendor: 'Qualcomm', mem: 8, cores: 8 },
    { model: '2201123G', name: 'Xiaomi 12', w: 393, h: 873, dpr: 2.75, gpu: 'Adreno (TM) 730', vendor: 'Qualcomm', mem: 8, cores: 8 },
    { model: 'M2101K6G', name: 'Redmi Note 10 Pro', w: 393, h: 851, dpr: 2.75, gpu: 'Adreno (TM) 618', vendor: 'Qualcomm', mem: 6, cores: 8 },
    { model: '22101316G', name: 'Redmi Note 12 Pro', w: 393, h: 873, dpr: 2.75, gpu: 'Mali-G610 MC6', vendor: 'ARM', mem: 8, cores: 8 },
    { model: '23076RN4BI', name: 'Redmi Note 13 Pro', w: 393, h: 873, dpr: 2.75, gpu: 'Adreno (TM) 710', vendor: 'Qualcomm', mem: 8, cores: 8 },
    { model: '22021211RG', name: 'POCO X4 Pro', w: 393, h: 851, dpr: 2.75, gpu: 'Adreno (TM) 619', vendor: 'Qualcomm', mem: 6, cores: 8 },
    { model: '23049PCD8G', name: 'POCO F5', w: 393, h: 873, dpr: 2.75, gpu: 'Adreno (TM) 730', vendor: 'Qualcomm', mem: 8, cores: 8 },
    // OPPO / Realme
    { model: 'CPH2581', name: 'OPPO Find X7 Ultra', w: 412, h: 915, dpr: 3.5, gpu: 'Adreno (TM) 750', vendor: 'Qualcomm', mem: 16, cores: 8 },
    { model: 'CPH2519', name: 'OPPO Reno 10 Pro', w: 412, h: 915, dpr: 2.75, gpu: 'Adreno (TM) 735', vendor: 'Qualcomm', mem: 12, cores: 8 },
    { model: 'CPH2477', name: 'OPPO A78', w: 360, h: 800, dpr: 2, gpu: 'Mali-G57 MC2', vendor: 'ARM', mem: 8, cores: 8 },
    { model: 'RMX3630', name: 'Realme 11 Pro+', w: 412, h: 915, dpr: 2.75, gpu: 'Mali-G610 MC6', vendor: 'ARM', mem: 8, cores: 8 },
    { model: 'RMX3563', name: 'Realme GT Neo 3', w: 393, h: 873, dpr: 2.75, gpu: 'Mali-G610 MC6', vendor: 'ARM', mem: 8, cores: 8 },
    { model: 'RMX3085', name: 'Realme 8', w: 393, h: 851, dpr: 2.75, gpu: 'Mali-G76 MC4', vendor: 'ARM', mem: 6, cores: 8 },
    // Huawei
    { model: 'NOH-NX9', name: 'Huawei Mate 40 Pro', w: 393, h: 851, dpr: 3, gpu: 'Mali-G78 MP24', vendor: 'ARM', mem: 8, cores: 8 },
    { model: 'OCE-AN10', name: 'Huawei Mate 50 Pro', w: 393, h: 873, dpr: 3, gpu: 'Adreno (TM) 730', vendor: 'Qualcomm', mem: 8, cores: 8 },
    { model: 'ALT-AL10', name: 'Huawei Nova 12', w: 393, h: 873, dpr: 2.75, gpu: 'Adreno (TM) 642L', vendor: 'Qualcomm', mem: 8, cores: 8 },
    // Motorola
    { model: 'XT2347-2', name: 'Moto Edge 40 Pro', w: 412, h: 915, dpr: 3, gpu: 'Adreno (TM) 740', vendor: 'Qualcomm', mem: 12, cores: 8 },
    { model: 'XT2301-4', name: 'Moto G84', w: 393, h: 873, dpr: 2.75, gpu: 'Adreno (TM) 619', vendor: 'Qualcomm', mem: 8, cores: 8 },
    { model: 'XT2243-1', name: 'Moto G53', w: 384, h: 854, dpr: 2, gpu: 'Adreno (TM) 619', vendor: 'Qualcomm', mem: 4, cores: 8 },
    // Sony Xperia
    { model: 'XQ-DQ72', name: 'Xperia 1 V', w: 412, h: 915, dpr: 3.5, gpu: 'Adreno (TM) 740', vendor: 'Qualcomm', mem: 12, cores: 8 },
    { model: 'XQ-CQ72', name: 'Xperia 5 IV', w: 393, h: 873, dpr: 3, gpu: 'Adreno (TM) 730', vendor: 'Qualcomm', mem: 8, cores: 8 },
    // Vivo
    { model: 'V2254A', name: 'vivo X90 Pro', w: 412, h: 915, dpr: 3, gpu: 'Mali-G710 MC10', vendor: 'ARM', mem: 12, cores: 8 },
    { model: 'V2219', name: 'vivo V27 Pro', w: 393, h: 873, dpr: 2.75, gpu: 'Mali-G610 MC6', vendor: 'ARM', mem: 8, cores: 8 },
    // Nothing
    { model: 'A065', name: 'Nothing Phone (2)', w: 412, h: 915, dpr: 2.75, gpu: 'Adreno (TM) 740', vendor: 'Qualcomm', mem: 12, cores: 8 },
    { model: 'A063', name: 'Nothing Phone (1)', w: 412, h: 915, dpr: 2.625, gpu: 'Adreno (TM) 642L', vendor: 'Qualcomm', mem: 8, cores: 8 },
    // ASUS ROG
    { model: 'AI2401', name: 'ROG Phone 8 Pro', w: 412, h: 915, dpr: 3, gpu: 'Adreno (TM) 750', vendor: 'Qualcomm', mem: 24, cores: 8 },
    { model: 'AI2301', name: 'ROG Phone 7', w: 412, h: 915, dpr: 3, gpu: 'Adreno (TM) 740', vendor: 'Qualcomm', mem: 16, cores: 8 },
    // LG (older but still used)
    { model: 'LM-V510', name: 'LG V60 ThinQ', w: 412, h: 915, dpr: 3, gpu: 'Adreno (TM) 650', vendor: 'Qualcomm', mem: 8, cores: 8 },
    { model: 'LM-G900', name: 'LG Velvet', w: 412, h: 915, dpr: 2.625, gpu: 'Adreno (TM) 620', vendor: 'Qualcomm', mem: 6, cores: 8 },
    // Nokia / HMD
    { model: 'TA-1568', name: 'Nokia G42', w: 384, h: 854, dpr: 2, gpu: 'Adreno (TM) 619', vendor: 'Qualcomm', mem: 6, cores: 8 },
    // Tecno / Infinix (Africa/Asia popular)
    { model: 'CK9n', name: 'Tecno Phantom V Fold', w: 360, h: 748, dpr: 3, gpu: 'Mali-G610 MC6', vendor: 'ARM', mem: 12, cores: 8 },
    { model: 'X6833B', name: 'Infinix Zero 30', w: 393, h: 873, dpr: 2.75, gpu: 'Mali-G610 MC6', vendor: 'ARM', mem: 8, cores: 8 },
];

const IPHONE_MODELS = [
    // iPhone 15 series
    { model: 'iPhone16,2', name: 'iPhone 15 Pro Max', w: 430, h: 932, dpr: 3, gpu: 'Apple A17 Pro GPU', mem: 8, cores: 6, iosMin: '17_0' },
    { model: 'iPhone16,1', name: 'iPhone 15 Pro', w: 393, h: 852, dpr: 3, gpu: 'Apple A17 Pro GPU', mem: 8, cores: 6, iosMin: '17_0' },
    { model: 'iPhone15,5', name: 'iPhone 15 Plus', w: 430, h: 932, dpr: 3, gpu: 'Apple A16 Bionic GPU', mem: 6, cores: 6, iosMin: '17_0' },
    { model: 'iPhone15,4', name: 'iPhone 15', w: 393, h: 852, dpr: 3, gpu: 'Apple A16 Bionic GPU', mem: 6, cores: 6, iosMin: '17_0' },
    // iPhone 14 series
    { model: 'iPhone15,3', name: 'iPhone 14 Pro Max', w: 430, h: 932, dpr: 3, gpu: 'Apple A16 Bionic GPU', mem: 6, cores: 6, iosMin: '16_0' },
    { model: 'iPhone15,2', name: 'iPhone 14 Pro', w: 393, h: 852, dpr: 3, gpu: 'Apple A16 Bionic GPU', mem: 6, cores: 6, iosMin: '16_0' },
    { model: 'iPhone14,8', name: 'iPhone 14 Plus', w: 428, h: 926, dpr: 3, gpu: 'Apple A15 Bionic GPU', mem: 6, cores: 6, iosMin: '16_0' },
    { model: 'iPhone14,7', name: 'iPhone 14', w: 390, h: 844, dpr: 3, gpu: 'Apple A15 Bionic GPU', mem: 6, cores: 6, iosMin: '16_0' },
    // iPhone 13 series
    { model: 'iPhone14,3', name: 'iPhone 13 Pro Max', w: 428, h: 926, dpr: 3, gpu: 'Apple A15 Bionic GPU', mem: 6, cores: 6, iosMin: '15_0' },
    { model: 'iPhone14,2', name: 'iPhone 13 Pro', w: 390, h: 844, dpr: 3, gpu: 'Apple A15 Bionic GPU', mem: 6, cores: 6, iosMin: '15_0' },
    { model: 'iPhone14,5', name: 'iPhone 13', w: 390, h: 844, dpr: 3, gpu: 'Apple A15 Bionic GPU', mem: 4, cores: 6, iosMin: '15_0' },
    { model: 'iPhone14,4', name: 'iPhone 13 Mini', w: 375, h: 812, dpr: 3, gpu: 'Apple A15 Bionic GPU', mem: 4, cores: 6, iosMin: '15_0' },
    // iPhone 12 series
    { model: 'iPhone13,4', name: 'iPhone 12 Pro Max', w: 428, h: 926, dpr: 3, gpu: 'Apple A14 Bionic GPU', mem: 6, cores: 6, iosMin: '14_1' },
    { model: 'iPhone13,3', name: 'iPhone 12 Pro', w: 390, h: 844, dpr: 3, gpu: 'Apple A14 Bionic GPU', mem: 6, cores: 6, iosMin: '14_1' },
    { model: 'iPhone13,2', name: 'iPhone 12', w: 390, h: 844, dpr: 3, gpu: 'Apple A14 Bionic GPU', mem: 4, cores: 6, iosMin: '14_1' },
    { model: 'iPhone13,1', name: 'iPhone 12 Mini', w: 375, h: 812, dpr: 3, gpu: 'Apple A14 Bionic GPU', mem: 4, cores: 6, iosMin: '14_1' },
    // iPhone 11 series
    { model: 'iPhone12,5', name: 'iPhone 11 Pro Max', w: 414, h: 896, dpr: 3, gpu: 'Apple A13 Bionic GPU', mem: 4, cores: 6, iosMin: '13_0' },
    { model: 'iPhone12,3', name: 'iPhone 11 Pro', w: 375, h: 812, dpr: 3, gpu: 'Apple A13 Bionic GPU', mem: 4, cores: 6, iosMin: '13_0' },
    { model: 'iPhone12,1', name: 'iPhone 11', w: 414, h: 896, dpr: 2, gpu: 'Apple A13 Bionic GPU', mem: 4, cores: 6, iosMin: '13_0' },
    // iPhone SE & X series
    { model: 'iPhone14,6', name: 'iPhone SE 3rd gen', w: 375, h: 667, dpr: 2, gpu: 'Apple A15 Bionic GPU', mem: 4, cores: 6, iosMin: '15_4' },
    { model: 'iPhone12,8', name: 'iPhone SE 2nd gen', w: 375, h: 667, dpr: 2, gpu: 'Apple A13 Bionic GPU', mem: 3, cores: 6, iosMin: '13_4' },
    { model: 'iPhone11,2', name: 'iPhone XS', w: 375, h: 812, dpr: 3, gpu: 'Apple A12 Bionic GPU', mem: 4, cores: 6, iosMin: '12_0' },
    { model: 'iPhone11,6', name: 'iPhone XS Max', w: 414, h: 896, dpr: 3, gpu: 'Apple A12 Bionic GPU', mem: 4, cores: 6, iosMin: '12_0' },
    { model: 'iPhone11,8', name: 'iPhone XR', w: 414, h: 896, dpr: 2, gpu: 'Apple A12 Bionic GPU', mem: 3, cores: 6, iosMin: '12_0' },
    // iPad emulating as mobile (common in real world)
    { model: 'iPad13,18', name: 'iPad Air 5th', w: 820, h: 1180, dpr: 2, gpu: 'Apple M1 GPU', mem: 8, cores: 8, iosMin: '15_4' },
    { model: 'iPad14,1', name: 'iPad Mini 6th', w: 744, h: 1133, dpr: 2, gpu: 'Apple A15 Bionic GPU', mem: 4, cores: 6, iosMin: '15_0' },
];

const ANDROID_VERSIONS = ['10', '11', '12', '12L', '13', '14'];
const CHROME_VERSIONS = ['112.0.0.0', '114.0.0.0', '116.0.0.0', '118.0.0.0', '119.0.0.0', '120.0.0.0', '121.0.0.0', '122.0.0.0', '123.0.0.0', '124.0.0.0'];
const IOS_SUBVERSIONS = ['0', '1', '2', '3', '4', '5', '6'];
const SAFARI_VERSIONS = ['14.1.2', '15.0', '15.4', '15.6', '16.0', '16.1', '16.4', '16.5', '17.0', '17.1', '17.2'];

const TIMEZONES = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Toronto', 'America/Mexico_City', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
    'Europe/Moscow', 'Europe/Istanbul', 'Europe/Warsaw',
    'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Dubai',
    'Asia/Kolkata', 'Asia/Tashkent', 'Asia/Jakarta', 'Asia/Bangkok',
    'Australia/Sydney', 'Africa/Lagos', 'Africa/Johannesburg'
];

const LOCALES = ['en-US', 'en-GB', 'en-AU', 'en-CA', 'de-DE', 'fr-FR', 'es-ES', 'pt-BR', 'ja-JP', 'ko-KR', 'zh-CN', 'ru-RU', 'it-IT', 'tr-TR', 'pl-PL', 'nl-NL', 'ar-SA'];

const GEO_LOCATIONS = [
    { lat: 40.7128, lon: -74.0060 },   // New York
    { lat: 34.0522, lon: -118.2437 },  // Los Angeles
    { lat: 41.8781, lon: -87.6298 },   // Chicago
    { lat: 29.7604, lon: -95.3698 },   // Houston
    { lat: 51.5074, lon: -0.1278 },    // London
    { lat: 48.8566, lon: 2.3522 },     // Paris
    { lat: 52.5200, lon: 13.4050 },    // Berlin
    { lat: 35.6762, lon: 139.6503 },   // Tokyo
    { lat: 37.5665, lon: 126.9780 },   // Seoul
    { lat: 55.7558, lon: 37.6173 },    // Moscow
    { lat: 41.2995, lon: 69.2401 },    // Tashkent
    { lat: 19.4326, lon: -99.1332 },   // Mexico City
    { lat: -23.5505, lon: -46.6333 },  // Sao Paulo
    { lat: 28.6139, lon: 77.2090 },    // Delhi
    { lat: 1.3521, lon: 103.8198 },    // Singapore
    { lat: 25.2048, lon: 55.2708 },    // Dubai
    { lat: -33.8688, lon: 151.2093 },  // Sydney
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function jitter(val, range) { return val + (Math.random() * range * 2 - range); }

// ============================================================
// PROCEDURAL HARDWARE PROFILE GENERATOR
// Combines real device databases to emit unique fingerprints
// ============================================================
function generateHardwareProfile() {
    const isIOS = Math.random() > 0.55;
    const tz = pick(TIMEZONES);
    const locale = pick(LOCALES);
    const geo = pick(GEO_LOCATIONS);

    if (isIOS) {
        const device = pick(IPHONE_MODELS);
        const majorV = device.iosMin.split('_')[0];
        const subV = pick(IOS_SUBVERSIONS);
        const iosVersion = `${majorV}_${subV}`;
        const safariV = pick(SAFARI_VERSIONS);

        return {
            userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS ${iosVersion} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${safariV} Mobile/15E148 Safari/604.1`,
            vendor: 'Apple Inc.',
            renderer: device.gpu,
            platform: 'iPhone',
            width: device.w,
            height: device.h,
            dpr: device.dpr,
            memory: device.mem,
            cores: device.cores,
            maxTouchPoints: 5,
            timezone: tz,
            locale: locale,
            geo: { latitude: jitter(geo.lat, 0.02), longitude: jitter(geo.lon, 0.02) },
            // Canvas noise seed — unique per session
            canvasSeed: Math.random(),
            audioSeed: Math.random(),
        };
    } else {
        const device = pick(ANDROID_MODELS);
        const androidV = pick(ANDROID_VERSIONS);
        const chromeV = pick(CHROME_VERSIONS);

        return {
            userAgent: `Mozilla/5.0 (Linux; Android ${androidV}; ${device.model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeV} Mobile Safari/537.36`,
            vendor: device.vendor,
            renderer: device.gpu,
            platform: 'Linux armv8l',
            width: device.w,
            height: device.h,
            dpr: device.dpr,
            memory: device.mem,
            cores: device.cores,
            maxTouchPoints: 5,
            timezone: tz,
            locale: locale,
            geo: { latitude: jitter(geo.lat, 0.02), longitude: jitter(geo.lon, 0.02) },
            canvasSeed: Math.random(),
            audioSeed: Math.random(),
        };
    }
}

// ============================================================
// BROWSER LAUNCH WITH FULL VIRTUAL-BOX EMULATION
// ============================================================
async function launchBrowser(proxy, headless = true) {
    const launchOptions = {
        headless: headless,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--use-gl=swiftshader',
            '--lang=en-US,en'
        ]
    };

    if (proxy) {
        const pt = (proxy.type || 'http').toLowerCase();
        launchOptions.proxy = { server: `${pt}://${proxy.host}:${proxy.port}` };
        if (proxy.username && proxy.password) {
            launchOptions.proxy.username = proxy.username;
            launchOptions.proxy.password = proxy.password;
        }
    }

    const browser = await chromium.launch(launchOptions);
    const hw = generateHardwareProfile();

    const context = await browser.newContext({
        viewport: { width: hw.width, height: hw.height },
        userAgent: hw.userAgent,
        deviceScaleFactor: hw.dpr,
        isMobile: true,
        hasTouch: true,
        ignoreHTTPSErrors: true,
        locale: hw.locale,
        timezoneId: hw.timezone,
        permissions: ['geolocation'],
        geolocation: hw.geo,
        colorScheme: Math.random() > 0.5 ? 'dark' : 'light',
        javaScriptEnabled: true,
    });

    // ============================================================
    // FULL HARDWARE ID INJECTION (VIRTUAL BOX LAYER)
    // ============================================================
    await context.addInitScript((hw) => {
        // --- Navigator Properties ---
        const navProps = {
            webdriver: undefined,
            deviceMemory: hw.memory,
            hardwareConcurrency: hw.cores,
            maxTouchPoints: hw.maxTouchPoints,
            platform: hw.platform,
            languages: [hw.locale.replace('_', '-'), hw.locale.split('-')[0]],
        };
        for (const [key, value] of Object.entries(navProps)) {
            try { Object.defineProperty(navigator, key, { get: () => value }); } catch (e) {}
        }

        // --- Chrome object for Android ---
        if (hw.platform !== 'iPhone') {
            window.chrome = { runtime: {}, csi: () => ({}), loadTimes: () => ({}) };
        }

        // --- WebGL GPU Fingerprint Spoofing ---
        const spoofWebGL = (proto) => {
            const original = proto.getParameter;
            proto.getParameter = function(param) {
                if (param === 37445) return hw.vendor;   // UNMASKED_VENDOR_WEBGL
                if (param === 37446) return hw.renderer;  // UNMASKED_RENDERER_WEBGL
                return original.call(this, param);
            };
        };
        try { spoofWebGL(WebGLRenderingContext.prototype); } catch (e) {}
        try { spoofWebGL(WebGL2RenderingContext.prototype); } catch (e) {}

        // --- Canvas Fingerprint Noise ---
        const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(type) {
            const ctx = this.getContext('2d');
            if (ctx) {
                const imgData = ctx.getImageData(0, 0, this.width, this.height);
                const seed = hw.canvasSeed;
                for (let i = 0; i < imgData.data.length; i += 4) {
                    imgData.data[i] = imgData.data[i] ^ ((seed * (i + 1)) & 1);
                }
                ctx.putImageData(imgData, 0, 0);
            }
            return origToDataURL.apply(this, arguments);
        };
        const origToBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function(cb, type, quality) {
            const ctx = this.getContext('2d');
            if (ctx) {
                const imgData = ctx.getImageData(0, 0, this.width, this.height);
                const seed = hw.canvasSeed;
                for (let i = 0; i < imgData.data.length; i += 4) {
                    imgData.data[i] = imgData.data[i] ^ ((seed * (i + 1)) & 1);
                }
                ctx.putImageData(imgData, 0, 0);
            }
            return origToBlob.apply(this, arguments);
        };

        // --- AudioContext Fingerprint Noise ---
        try {
            const origCreateOscillator = AudioContext.prototype.createOscillator;
            AudioContext.prototype.createOscillator = function() {
                const osc = origCreateOscillator.call(this);
                const origFreq = osc.frequency.value;
                osc.frequency.value = origFreq + (hw.audioSeed * 0.01 - 0.005);
                return osc;
            };
        } catch (e) {}

        // --- Screen Properties ---
        try {
            Object.defineProperty(screen, 'width', { get: () => hw.width * hw.dpr });
            Object.defineProperty(screen, 'height', { get: () => hw.height * hw.dpr });
            Object.defineProperty(screen, 'availWidth', { get: () => hw.width * hw.dpr });
            Object.defineProperty(screen, 'availHeight', { get: () => (hw.height - 40) * hw.dpr });
            Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
            Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
        } catch (e) {}

        // --- Battery API Spoofing ---
        try {
            if (navigator.getBattery) {
                navigator.getBattery = () => Promise.resolve({
                    charging: Math.random() > 0.5,
                    chargingTime: Math.random() > 0.5 ? Infinity : Math.floor(Math.random() * 3600),
                    dischargingTime: Math.floor(Math.random() * 20000) + 3600,
                    level: Math.random() * 0.6 + 0.3,
                    addEventListener: () => {},
                });
            }
        } catch (e) {}

        // --- Permissions API ---
        try {
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (params) =>
                params.name === 'notifications'
                    ? Promise.resolve({ state: 'default' })
                    : originalQuery(params);
        } catch (e) {}

        // --- Plugins array (empty on mobile) ---
        try {
            Object.defineProperty(navigator, 'plugins', { get: () => [] });
            Object.defineProperty(navigator, 'mimeTypes', { get: () => [] });
        } catch (e) {}

    }, hw);

    return { browser, context };
}

module.exports = { launchBrowser };