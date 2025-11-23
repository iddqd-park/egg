// --- Audio System (Web Audio API) ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
let isMuted = false;
let bgmOscillators = [];
let bgmInterval;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function toggleAudio() {
    isMuted = !isMuted;
    const btn = document.getElementById('audioBtn');
    btn.innerText = isMuted ? "🔇" : "🔊";

    if (isMuted) {
        bgmAudio.pause();
    } else {
        if (isPlaying) bgmAudio.play().catch(e => console.log(e));
    }
}

function playTone(freq, type, duration, vol = 0.1) {
    if (isMuted || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function sfxCatchGood() {
    playTone(880, 'sine', 0.1, 0.1); // A5
    setTimeout(() => playTone(1109, 'sine', 0.2, 0.1), 50); // C#6
}

function sfxCatchBad() {
    playTone(150, 'sawtooth', 0.3, 0.1);
    playTone(100, 'square', 0.3, 0.1);
}

function sfxItem() {
    if (isMuted || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

let bgmAudio = new Audio('bgm.mp3');
bgmAudio.loop = true;
bgmAudio.volume = 0.5;

function playBGM() {
    if (isMuted) return;
    bgmAudio.play().catch(e => console.log("Audio play failed:", e));
    isPlaying = true;
}

function stopBGM() {
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
}


// --- Game Configuration ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const effectOverlay = document.getElementById('effect-overlay');

// Game State
let isPlaying = false;
let score = 0;
let cages = 0; // Replaces lives logic for bad eggs
let combo = 0;
let frameCount = 0;
let speedMultiplier = 1.0;

// Item State
let magnetTimer = 0;

// Entities
// Player size: Base 70x70 (was 140), grows with score
// Player size: Base 140x140 (Fixed size)
const BASE_PLAYER_SIZE = 140;
let player = {
    x: 0, y: 0, width: BASE_PLAYER_SIZE, height: BASE_PLAYER_SIZE,
    targetX: 0, // For smooth movement
    scaleX: 1, scaleY: 1,
    targetScaleX: 1, targetScaleY: 1
};
let eggs = [];
let items = [];
let particles = [];
let floatingTexts = [];

// Assets (Images)
const IMAGES = {
    basket: new Image(),
    egg: new Image(),
    cage: new Image(),
    bomb: new Image(),
    magnet: new Image()
};

let imagesLoaded = 0;
const totalImages = Object.keys(IMAGES).length;

function loadImages(callback) {
    const imageSources = {
        basket: 'images/basket.png',
        egg: 'images/egg.png',
        cage: 'images/cage.png',
        bomb: 'images/bomb.png',
        magnet: 'images/magnet.png'
    };

    for (let key in imageSources) {
        IMAGES[key].src = imageSources[key];
        IMAGES[key].onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) {
                if (callback) callback();
            }
        };
    }
}

// Preload images immediately
loadImages(() => {
    console.log("All images loaded!");
});

const CLOUD_EMOJI = "☁️"; // Keep cloud as emoji for now or remove if not needed


// Items
const ITEM_TYPES = [
    { type: 'MAGNET', image: 'magnet', duration: 300 }, // 5 seconds
    { type: 'BOMB', image: 'bomb', score: 0 } // Instant death
];

// Egg Definitions
const EGG_TYPES = [
    { type: 1, color: '#28a745', text: '1', score: 10, isGood: true, cagePenalty: 0 },
    { type: 2, color: '#17a2b8', text: '2', score: 5, isGood: true, cagePenalty: 0 },
    { type: 3, color: '#fd7e14', text: '3', score: -5, isGood: false, cagePenalty: 1 },
    { type: 4, color: '#dc3545', text: '4', score: -10, isGood: false, cagePenalty: 2 }
];


// --- Viewport / Initialization ---

// 실제 화면 높이를 CSS 변수 --vh 에 저장해서 100vh 이슈를 회피
function updateViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

function resizeCanvas() {
    // 가로는 480px 까지만, 세로는 항상 실제 viewport 높이
    canvas.width = window.innerWidth > 500 ? 480 : window.innerWidth;
    canvas.height = window.innerHeight;

    // Move basket up slightly (was -160, now -200)
    player.y = canvas.height - 200;
    player.x = canvas.width / 2 - player.width / 2;
    player.targetX = player.x;
}

// 리사이즈/회전 시 viewport + 캔버스 모두 재계산
window.addEventListener('resize', () => {
    updateViewportHeight();
    resizeCanvas();
});

window.addEventListener('orientationchange', () => {
    // 회전 직후에는 값이 바로 안 맞는 경우가 있어서 약간 딜레이
    setTimeout(() => {
        updateViewportHeight();
        resizeCanvas();
    }, 200);
});

// 최초 1회 설정
updateViewportHeight();
resizeCanvas();


// --- Input Handling ---
function updatePlayerPosition(clientX) {
    const rect = canvas.getBoundingClientRect();
    let x = clientX - rect.left;
    // Boundary check for target
    if (x < player.width / 2) x = player.width / 2;
    if (x > canvas.width - player.width / 2) x = canvas.width - player.width / 2;

    // Set target instead of direct position
    player.targetX = x - player.width / 2;
}

canvas.addEventListener('mousemove', (e) => { if (isPlaying) updatePlayerPosition(e.clientX); });
canvas.addEventListener('touchmove', (e) => {
    if (isPlaying) {
        e.preventDefault();
        updatePlayerPosition(e.touches[0].clientX);
    }
}, { passive: false });
canvas.addEventListener('touchstart', (e) => {
    if (isPlaying) {
        initAudio();
        updatePlayerPosition(e.touches[0].clientX);
    }
}, { passive: false });
canvas.addEventListener('click', () => initAudio());

window.addEventListener('keydown', (e) => {
    if (!isPlaying) return;
    initAudio();
    const step = 30;
    if (e.key === 'ArrowLeft') {
        player.targetX = Math.max(0, player.targetX - step);
    } else if (e.key === 'ArrowRight') {
        player.targetX = Math.min(canvas.width - player.width, player.targetX + step);
    }
});

// --- Game Logic ---
function startGame() {
    initAudio();
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('gameOverUI').classList.remove('hidden');
    document.getElementById('certUI').classList.add('hidden');
    document.getElementById('inGameUI').classList.remove('hidden');

    score = 0;
    cages = 0;
    combo = 0;
    speedMultiplier = 1.0;
    magnetTimer = 0;
    eggs = [];
    items = [];
    particles = [];
    floatingTexts = [];
    frameCount = 0;
    isPlaying = true;

    player.scaleX = 1;
    player.scaleY = 1;
    player.width = BASE_PLAYER_SIZE;
    player.height = BASE_PLAYER_SIZE;
    player.x = canvas.width / 2 - player.width / 2;
    player.targetX = player.x;

    effectOverlay.className = '';
    updateUI();
    playBGM();
    gameLoop();
}

function gameOver() {
    isPlaying = false;
    stopBGM();
    sfxCatchBad();
    document.getElementById('inGameUI').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.remove('hidden');
    document.getElementById('finalScore').innerText = score;
    document.getElementById('playerName').value = "";
    effectOverlay.className = '';

    // 게임 오버 화면을 항상 맨 위에서 시작하도록
    const gameOverScreen = document.getElementById('gameOverScreen');
    if (gameOverScreen) gameOverScreen.scrollTop = 0;
}

function resetGame() {
    startGame();
}

function spawnEgg() {
    const typeIdx = Math.floor(Math.random() * 4);
    const eggData = EGG_TYPES[typeIdx];
    const size = 80;
    const x = Math.random() * (canvas.width - size);

    const date = new Date();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const farm = Math.random().toString(36).substring(2, 7).toUpperCase();

    eggs.push({
        x: x,
        y: -100,
        size: size,
        data: eggData,
        codeDate: `${mm}${dd}`,
        codeFarm: `${farm} ${eggData.text}`,
        speed: (3 + Math.random() * 2) * speedMultiplier,
        vx: 0, vy: 0, // For physics
        rotation: (Math.random() - 0.5) * 0.2
    });
}

function spawnItem() {
    const typeIdx = Math.floor(Math.random() * ITEM_TYPES.length);
    const itemData = ITEM_TYPES[typeIdx];
    const size = 60;
    const x = Math.random() * (canvas.width - size);

    items.push({
        x: x,
        y: -100,
        size: size,
        data: itemData,
        speed: (4 + Math.random() * 2) * speedMultiplier,
        angle: 0
    });
}

function createParticles(x, y, color) {
    for (let i = 0; i < 8; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 30,
            color: color
        });
    }
}

function showFloatingText(text, x, y, color) {
    floatingTexts.push({
        text: text,
        x: x,
        y: y,
        life: 40, // Should last ~0.6 seconds
        color: color
    });
}

function triggerBasketBounce() {
    player.scaleY = 0.7;
    player.scaleX = 1.3;
}

function update() {
    frameCount++;

    // Difficulty Scaling based on Score
    // Speed increases by 10% every 50 points approx
    speedMultiplier = 1.0 + (score * 0.002);

    // Cap speed to avoid chaos
    if (speedMultiplier > 3.0) speedMultiplier = 3.0;

    // Spawn Rate increases with score (inverse of speedMultiplier)
    // Base interval 60 frames. At 2x speed, 30 frames.
    let spawnInterval = Math.max(15, Math.floor(60 / speedMultiplier));

    if (frameCount % spawnInterval === 0) {
        spawnEgg();
    }

    if (frameCount % 300 === 0 && Math.random() < 0.7) {
        spawnItem();
    }

    if (magnetTimer > 0) {
        magnetTimer--;
        if (magnetTimer === 0) {
            effectOverlay.classList.remove('effect-magnet');
            effectOverlay.style.opacity = 0;
        }
    }

    player.scaleX += (1 - player.scaleX) * 0.2;
    player.scaleY += (1 - player.scaleY) * 0.2;

    // Smooth Movement Logic (No Teleport)
    const MAX_SPEED = 25; // Max pixels per frame
    let dx = player.targetX - player.x;
    if (Math.abs(dx) > 1) {
        // Move towards target with max speed limit
        let move = dx * 0.2; // Lerp factor
        if (move > MAX_SPEED) move = MAX_SPEED;
        if (move < -MAX_SPEED) move = -MAX_SPEED;
        player.x += move;
    }

    // Keep player within bounds
    if (player.x < 0) player.x = 0;
    if (player.x > canvas.width - player.width) player.x = canvas.width - player.width;

    // Update Eggs
    for (let i = eggs.length - 1; i >= 0; i--) {
        let egg = eggs[i];

        if (magnetTimer > 0) {
            // Magnet Logic: Only X acceleration, no Y change
            let centerX = egg.x + egg.size / 2;
            let targetX = player.x + player.width / 2;

            let distX = targetX - centerX;

            // Accelerate X towards player
            // Reduced force for "not too fast"
            egg.vx += distX * 0.0007;

            // Cap horizontal velocity
            if (egg.vx > 5) egg.vx = 5;
            if (egg.vx < -5) egg.vx = -5;

            egg.x += egg.vx;

            // Normal Gravity Y
            egg.y += egg.speed;

            // Damping
            egg.vx *= 0.95;

        } else {
            // Normal gravity/falling
            egg.y += egg.speed;
            egg.vx = 0;
        }

        // Collision (Hitbox)
        let hbW = player.width * COLLISION_CONFIG.player.width;
        let hbH = player.height * COLLISION_CONFIG.player.height;
        let hbX = player.x + (player.width - hbW) / 2;
        let hbY = player.y + (player.height - hbH) / 2;

        // Egg Hitbox
        let eggHbW = egg.size * COLLISION_CONFIG.egg.width;
        let eggHbH = egg.size * COLLISION_CONFIG.egg.height;
        let eggHbX = egg.x + (egg.size - eggHbW) / 2;
        let eggHbY = egg.y + (egg.size - eggHbH) / 2;

        let hit =
            eggHbX < hbX + hbW &&
            eggHbX + eggHbW > hbX &&
            eggHbY < hbY + hbH &&
            eggHbY + eggHbH > hbY;

        if (hit) {
            triggerBasketBounce();

            if (egg.data.isGood) {
                combo++;
                let bonus = Math.floor(combo / 5) * 5;
                let finalScore = egg.data.score + bonus;
                score += finalScore;

                sfxCatchGood();
                createParticles(egg.x + egg.size / 2, egg.y + egg.size / 2, '#FFD700');
                showFloatingText(`+${finalScore}`, egg.x, egg.y, '#fff');
            } else {
                combo = 0;
                // Cage Logic
                cages += egg.data.cagePenalty;

                sfxCatchBad();
                createParticles(egg.x + egg.size / 2, egg.y + egg.size / 2, '#FF0000');
                showFloatingText(`+${egg.data.cagePenalty} 🏚️`, egg.x, egg.y, '#ff0000');

                canvas.style.transform = "translateX(5px)";
                setTimeout(() => canvas.style.transform = "translateX(0)", 50);

                if (cages >= 5) {
                    gameOver();
                }
            }
            eggs.splice(i, 1);
            updateUI();
            continue;
        }

        if (egg.y > canvas.height) {
            eggs.splice(i, 1);
        }
    }

    // Update Items
    for (let i = items.length - 1; i >= 0; i--) {
        let item = items[i];
        // Move Item
        item.y += item.speed;
        item.angle += 0.1;

        // Collision (Hitbox)
        let hbW = player.width * COLLISION_CONFIG.player.width;
        let hbH = player.height * COLLISION_CONFIG.player.height;
        let hbX = player.x + (player.width - hbW) / 2;
        let hbY = player.y + (player.height - hbH) / 2;

        // Item Hitbox
        let itemHbW = item.size * COLLISION_CONFIG.item.width;
        let itemHbH = item.size * COLLISION_CONFIG.item.height;
        let itemHbX = item.x + (item.size - itemHbW) / 2;
        let itemHbY = item.y + (item.size - itemHbH) / 2;

        let hit =
            itemHbX < hbX + hbW &&
            itemHbX + itemHbW > hbX &&
            itemHbY < hbY + hbH &&
            itemHbY + itemHbH > hbY;

        if (hit) {
            triggerBasketBounce();
            sfxItem();

            if (item.data.type === 'MAGNET') {
                magnetTimer = item.data.duration;
                effectOverlay.classList.add('effect-magnet');
                effectOverlay.style.opacity = 1;
                showFloatingText("🧲 MAGNET!", player.x, player.y - 20, '#00BFFF');
            } else if (item.data.type === 'BOMB') {
                // Instant Game Over
                createParticles(item.x + item.size / 2, item.y + item.size / 2, '#000');
                showFloatingText("💣 BOOM!", player.x, player.y - 20, '#000');
                effectOverlay.classList.add('effect-bomb');
                effectOverlay.style.opacity = 1;
                setTimeout(() => gameOver(), 300); // Slight delay to see boom
            }
            items.splice(i, 1);
            updateUI();
            continue;
        }

        if (item.y > canvas.height) items.splice(i, 1);
    }

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }

    // Update Floating Texts
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let ft = floatingTexts[i];
        ft.y -= 1;
        ft.life--;
        if (ft.life <= 0) floatingTexts.splice(i, 1);
    }
}

function drawImageAspect(ctx, img, x, y, w, h) {
    if (!img.complete || img.naturalWidth === 0) return;

    let scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    let nw = img.naturalWidth * scale;
    let nh = img.naturalHeight * scale;
    let nx = x + (w - nw) / 2;
    let ny = y + (h - nh) / 2;

    ctx.drawImage(img, nx, ny, nw, nh);
}

function draw() {
    // Clear Screen
    ctx.fillStyle = "#87CEEB"; // Sky Blue
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Clouds
    ctx.font = "60px Arial";
    ctx.fillText(CLOUD_EMOJI, 30, 80);
    ctx.fillText(CLOUD_EMOJI, canvas.width - 80, 120);

    // Draw Ground
    ctx.fillStyle = "#8BC34A"; // Grass Green
    ctx.fillRect(0, canvas.height - 20, canvas.width, 20);

    // Draw Cages (Farm)
    for (let i = 0; i < cages; i++) {
        // Distribute cages along the bottom
        // Max 5 cages, so space them out
        let spacing = 50;
        let startX = (canvas.width - (5 * spacing)) / 2 + 25;
        // Draw Cage Image (40x40)
        drawImageAspect(ctx, IMAGES.cage, startX + i * spacing - 20, canvas.height - 50, 40, 40);
    }

    // Draw Player (Basket)
    ctx.save();
    let centerX = player.x + player.width / 2;
    let bottomY = player.y + player.height;
    ctx.translate(centerX, bottomY);
    ctx.scale(player.scaleX, player.scaleY);
    ctx.translate(-centerX, -bottomY);

    // Draw Basket Image
    drawImageAspect(ctx, IMAGES.basket, player.x, player.y, player.width, player.height);

    // Draw Score Overlaid on Basket
    ctx.fillStyle = "white";
    ctx.font = `bold ${player.width * 0.2}px Jua`; // Scale font with basket
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    // Draw text at center of basket bounding box
    // Move up by reducing the addition or subtracting.
    // Previously: player.y + player.height / 2 + (player.height * 0.1)
    // Let's move it up significantly.
    let textY = player.y + player.height / 2 - 10;
    ctx.strokeText(`${score}점`, centerX, textY);
    ctx.fillText(`${score}점`, centerX, textY);

    ctx.restore();

    // Draw Combo Badge (Fire Emoji + Number)
    if (combo >= 2) {
        ctx.save();
        // Position: Bottom Right of Basket
        let badgeX = player.x + player.width - 20;
        let badgeY = player.y + player.height - 20;

        // Pulse effect
        let scale = 1 + Math.sin(frameCount * 0.2) * 0.1;
        ctx.translate(badgeX, badgeY);
        ctx.scale(scale, scale);

        // Draw Fire
        ctx.font = "50px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🔥", 0, 0);

        // Draw Number
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 3;
        ctx.font = "bold 24px Jua";
        ctx.strokeText(combo, 0, 5);
        ctx.fillText(combo, 0, 5);

        ctx.restore();
    }
    // Debug: Draw Player Box
    if (typeof CERT_CONFIG !== 'undefined' && CERT_CONFIG.debug_collision) {
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        // Draw actual hitbox
        let hbW = player.width * COLLISION_CONFIG.player.width;
        let hbH = player.height * COLLISION_CONFIG.player.height;
        let hbX = player.x + (player.width - hbW) / 2;
        let hbY = player.y + (player.height - hbH) / 2;
        ctx.strokeRect(hbX, hbY, hbW, hbH);

        // Optional: Draw full sprite bounds in lighter color
        ctx.strokeStyle = "rgba(255, 0, 0, 0.3)";
        ctx.strokeRect(player.x, player.y, player.width, player.height);
    }

    // Draw Eggs
    for (let egg of eggs) {
        let cx = egg.x + egg.size / 2;
        let cy = egg.y + egg.size / 2;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(egg.rotation || 0);

        // Draw Egg Image with Aspect Ratio
        // Since we are in a translated context, we draw at -size/2
        // We want to fit the egg within the box size x size
        drawImageAspect(ctx, IMAGES.egg, -egg.size / 2, -egg.size / 2, egg.size, egg.size);

        // Code Style: Black, 10% smaller (12px * 0.9 ~= 11px) -> Now 9px
        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctx.font = "bold 9px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillText(egg.codeDate, 0, -10);
        ctx.fillText(egg.codeFarm, 0, 10);

        ctx.restore();

        // Debug: Draw Egg Box
        if (typeof CERT_CONFIG !== 'undefined' && CERT_CONFIG.debug_collision) {
            ctx.strokeStyle = "red";
            ctx.lineWidth = 2;
            let hbW = egg.size * COLLISION_CONFIG.egg.width;
            let hbH = egg.size * COLLISION_CONFIG.egg.height;
            let hbX = egg.x + (egg.size - hbW) / 2;
            let hbY = egg.y + (egg.size - hbH) / 2;
            ctx.strokeRect(hbX, hbY, hbW, hbH);
        }
    }

    // Draw Items
    for (let item of items) {
        ctx.save();
        ctx.translate(item.x + item.size / 2, item.y + item.size / 2);
        ctx.rotate(Math.sin(item.angle) * 0.2);

        let img = IMAGES[item.data.image];
        if (img) {
            drawImageAspect(ctx, img, -item.size / 2, -item.size / 2, item.size, item.size);
        }

        ctx.restore();

        // Debug: Draw Item Box
        if (typeof CERT_CONFIG !== 'undefined' && CERT_CONFIG.debug_collision) {
            ctx.strokeStyle = "red";
            ctx.lineWidth = 2;
            let hbW = item.size * COLLISION_CONFIG.item.width;
            let hbH = item.size * COLLISION_CONFIG.item.height;
            let hbX = item.x + (item.size - hbW) / 2;
            let hbY = item.y + (item.size - hbH) / 2;
            ctx.strokeRect(hbX, hbY, hbW, hbH);
        }
    }

    // Draw Particles
    for (let p of particles) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / 30;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }

    // Draw Floating Texts
    for (let ft of floatingTexts) {
        ctx.fillStyle = ft.color;
        ctx.font = "bold 20px Jua";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 3;
        ctx.strokeText(ft.text, ft.x, ft.y);
        ctx.fillText(ft.text, ft.x, ft.y);
    }
}

function updateUI() {
    // Score is now drawn on canvas, but we might update DOM elements if they exist
    // We removed score from top bar in CSS/HTML plan, but let's keep the DOM update safe
    const scoreEl = document.getElementById('scoreVal');
    if (scoreEl) scoreEl.innerText = score;

    const comboUI = document.getElementById('comboUI');
    const comboVal = document.getElementById('comboVal');
    if (combo >= 2) {
        comboUI.classList.add('active');
        comboVal.innerText = combo;
    } else {
        comboUI.classList.remove('active');
    }
}

function gameLoop() {
    if (!isPlaying) return;
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function generateCertificate() {
    let name = document.getElementById('playerName').value.trim();
    if (!name) {
        alert("이름을 입력해주세요!");
        return;
    }
    const cCanvas = document.getElementById('certCanvas');
    const cCtx = cCanvas.getContext('2d');

    const certImg = new Image();
    certImg.src = "images/certi.jpg";

    certImg.onload = () => {
        const w = certImg.width;
        const h = certImg.height;
        cCanvas.width = w;
        cCanvas.height = h;

        // Draw Background
        cCtx.drawImage(certImg, 0, 0, w, h);

        // Draw Text
        cCtx.textAlign = "center";

        // Name
        cCtx.fillStyle = CERT_CONFIG.name.color;
        cCtx.font = CERT_CONFIG.name.fontSize;
        cCtx.fillText(name, w * CERT_CONFIG.name.x, h * CERT_CONFIG.name.y);

        // Score
        cCtx.fillStyle = CERT_CONFIG.score.color;
        cCtx.font = CERT_CONFIG.score.fontSize;
        cCtx.fillText(`${score}`, w * CERT_CONFIG.score.x, h * CERT_CONFIG.score.y);

        // Date
        cCtx.fillStyle = CERT_CONFIG.date.color;
        cCtx.font = CERT_CONFIG.date.fontSize;
        cCtx.fillText(new Date().toLocaleDateString(), w * CERT_CONFIG.date.x, h * CERT_CONFIG.date.y);

        const dataURL = cCanvas.toDataURL("image/png");
        const imgPreview = document.getElementById('cert-preview');
        const downloadBtn = document.getElementById('downloadLink');
        imgPreview.src = dataURL; imgPreview.style.display = 'block';
        downloadBtn.href = dataURL;

        // Switch UI
        document.getElementById('gameOverUI').classList.add('hidden');
        document.getElementById('certUI').classList.remove('hidden');

        // 인증서 화면도 맨 위에서 시작
        const gameOverScreen = document.getElementById('gameOverScreen');
        if (gameOverScreen) gameOverScreen.scrollTop = 0;
    };
}
