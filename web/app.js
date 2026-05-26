document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. TYPEWRITER EFFECT
    // ==========================================
    const typeElement = document.querySelector('.type-effect');
    const words = ["Zero Exceptions.", "100% Stealth.", "Endless Growth.", "Ultimate Control."];
    let wordIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let typeDelay = 100;

    function typeEffect() {
        const currentWord = words[wordIndex];
        
        if (isDeleting) {
            typeElement.textContent = currentWord.substring(0, charIndex - 1);
            charIndex--;
            typeDelay = 50;
        } else {
            typeElement.textContent = currentWord.substring(0, charIndex + 1);
            charIndex++;
            typeDelay = 100;
        }

        if (!isDeleting && charIndex === currentWord.length) {
            typeDelay = 2000; // Pause at the end
            isDeleting = true;
        } else if (isDeleting && charIndex === 0) {
            isDeleting = false;
            wordIndex = (wordIndex + 1) % words.length;
            typeDelay = 500; // Pause before typing new word
        }

        setTimeout(typeEffect, typeDelay);
    }
    
    if (typeElement) {
        // Start typing effect after initial fade-in animations resolve
        setTimeout(typeEffect, 1000);
    }

    // ==========================================
    // 2. LIVE TERMINAL / MATRIX HACKER EFFECT
    // ==========================================
    const terminalBody = document.getElementById('terminal-body');
    const logs = [
        { msg: "Initializing Core Protocol...", type: "log-info" },
        { msg: "Bypassing Playwright signature...", type: "log-info" },
        { msg: "[SUCCESS] Navigator.webdriver spoofed.", type: "log-success" },
        { msg: "Connecting to Proxy Network (Pool: 4,028 IPs)", type: "log-info" },
        { msg: "Routing active: 198.51.100.14:8080", type: "log-success" },
        { msg: "Injecting Instagram Payload module...", type: "log-info" },
        { msg: "Evaluating DOM Selectors...", type: "log-info" },
        { msg: "[WARN] Language mismatch detected. Forcing agnostic search.", type: "log-warn" },
        { msg: "Found target element via generic SVG path.", type: "log-success" },
        { msg: "Simulating human scroll latency (1,842ms)...", type: "log-info" },
        { msg: "[SUCCESS] Action executed safely. 0% detection.", type: "log-success" },
        { msg: "Thread suspending to simulate read time...", type: "log-info" }
    ];

    let logIndex = 0;

    function addLog() {
        if (!terminalBody) return;
        
        // Loop back to start if finished, but clear screen
        if (logIndex >= logs.length) {
            logIndex = 0;
            terminalBody.innerHTML = ''; // Clear for visual loop
            // Shuffle a bit for variation
            logs.sort(() => Math.random() - 0.5);
        }

        const log = logs[logIndex];
        const date = new Date();
        const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
        
        const p = document.createElement('p');
        p.className = 'log-line';
        p.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="${log.type}">${log.msg}</span>`;
        
        terminalBody.appendChild(p);
        
        // Auto scroll to bottom
        terminalBody.scrollTop = terminalBody.scrollHeight;
        
        logIndex++;
        
        // Random time for next log between 400ms and 2500ms
        const nextTime = Math.random() * 2000 + 400;
        setTimeout(addLog, nextTime);
    }
    
    if (terminalBody) {
        setTimeout(addLog, 1500);
    }

    // ==========================================
    // 3. INFINITE PLATFORM MARQUEE
    // ==========================================
    const marqueeContent = document.getElementById('marquee-content');
    if (marqueeContent) {
        const platforms = [
            { icon: 'fa-instagram', name: 'Instagram' },
            { icon: 'fa-youtube', name: 'YouTube' },
            { icon: 'fa-tiktok', name: 'TikTok' },
            { icon: 'fa-facebook', name: 'Facebook' },
            { icon: 'fa-telegram', name: 'Telegram' },
            { icon: 'fa-discord', name: 'Discord' },
            { icon: 'fa-x-twitter', name: 'X (Twitter)' },
            { icon: 'fa-spotify', name: 'Spotify' },
            { icon: 'fa-twitch', name: 'Twitch' },
            { icon: 'fa-google', name: 'Google' }
        ];

        // Create HTML string
        let contentHTML = '';
        platforms.forEach(p => {
            contentHTML += `<div class="platform-icon"><i class="fa-brands ${p.icon}"></i> ${p.name}</div>`;
        });

        // Duplicate the content 3 times to ensure a seamless infinite scroll loop
        marqueeContent.innerHTML = contentHTML + contentHTML + contentHTML;
    }

    // ==========================================
    // 4. SCROLL REVEAL (INTERSECTION OBSERVER)
    // ==========================================
    const revealElements = document.querySelectorAll('.reveal');
    
    const revealOptions = {
        threshold: 0.15,
        rootMargin: "0px 0px -50px 0px"
    };

    const revealOnScroll = new IntersectionObserver(function(entries, observer) {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                return;
            } else {
                entry.target.classList.add('active');
                // Optional: Stop observing once revealed
                observer.unobserve(entry.target);
            }
        });
    }, revealOptions);

    revealElements.forEach(el => {
        revealOnScroll.observe(el);
    });

});
