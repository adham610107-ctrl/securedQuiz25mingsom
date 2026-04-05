// ==========================================
// GOOGLE SHEETS & PWA CONFIGURATION
// ==========================================
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwDYG2cR4JYLSXfLdGbgtIPNQTmyEcl43wMhDSimAE0NWD_J4Ovbfd44XvKsbUbtoek/exec";

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW xatolik: ', err));
  });
}

function getOrCreateDeviceId() {
    let deviceId = localStorage.getItem('adham_pro_device_id');
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        localStorage.setItem('adham_pro_device_id', deviceId);
    }
    return deviceId;
}

// ==========================================
// AUTHENTICATION LOGIC
// ==========================================
async function authenticateUser() {
    const loginVal = document.getElementById('auth-login').value.trim();
    const passVal = document.getElementById('auth-password').value.trim();
    const keygenVal = document.getElementById('auth-keygen').value.trim(); // Yangilar uchun
    const errorEl = document.getElementById('auth-error');
    const btn = document.getElementById('btn-auth');

    if(!loginVal || !passVal) {
        errorEl.innerText = "Login va Parol majburiy!";
        errorEl.classList.remove('hidden');
        return;
    }

    btn.innerText = "Tekshirilmoqda...";
    btn.disabled = true;
    errorEl.classList.add('hidden');

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                login: loginVal,
                password: passVal,
                keygen: keygenVal,
                deviceId: getOrCreateDeviceId()
            })
        });

        const result = await response.json();

        if (result.success) {
            localStorage.setItem('pro_exam_auth', 'true');
            localStorage.setItem('pro_exam_name', result.name || loginVal);
            document.getElementById('student-name').value = result.name || loginVal;
            switchScreen('auth-screen', 'welcome-screen');
        } else {
            errorEl.innerText = result.message;
            errorEl.classList.remove('hidden');
        }
    } catch (e) {
        errorEl.innerText = "Tarmoqda xatolik yuz berdi. Internetni tekshiring.";
        errorEl.classList.remove('hidden');
    } finally {
        btn.innerText = "Kirish 🔒";
        btn.disabled = false;
    }
}

// ==========================================
// AUDIO, VIBRATION & PARTICLES 
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playFeedback(type) {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    if(type === 'correct') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
        if("vibrate" in navigator) navigator.vibrate(50);
    } else {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
        if("vibrate" in navigator) navigator.vibrate([150, 100, 150]);
    }
}

function createParticles(event) {
    if(!event) return;
    const x = event.clientX; const y = event.clientY;
    for (let i = 0; i < 12; i++) {
        let p = document.createElement('div'); p.className = 'magic-particle'; document.body.appendChild(p);
        let destX = x + (Math.random() - 0.5) * 120; let destY = y + (Math.random() - 0.5) * 120;
        p.style.left = x + 'px'; p.style.top = y + 'px';
        p.animate([
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${destX - x}px, ${destY - y}px) scale(0)`, opacity: 0 }
        ], { duration: 600, easing: 'ease-out' });
        setTimeout(() => p.remove(), 600);
    }
}

function forceCloseAllModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'); }
function closeModal(e, id) { if(e.target.id === id) document.getElementById(id).style.display = 'none'; }
function closeModalDirect(id) { document.getElementById(id).style.display = 'none'; }

// ==========================================
// GLOBAL VARIABLES & LOAD
// ==========================================
let bank = []; let currentTest = []; let userAnswers = []; let currentIndex = 0;
let currentUser = null; let timerInterval;
let stats = JSON.parse(localStorage.getItem('adham_pro_stats')) || { learned: [], errors: [] };
let pendingSubject = null; let pendingLevelQs = []; let testType = null;
let diffTime = 900; let orderMode = 'random'; let isExamMode = false;

async function loadData() {
    const files = ['musiqa_nazariyasi.json', 'cholgu_ijrochiligi.json', 'vokal_ijrochiligi.json', 'metodika_repertuar.json'];
    let globalId = 1;
    for (const f of files) {
        try {
            const res = await fetch(f); const data = await res.json();
            const subName = f.replace('.json', '');
            data.forEach(q => {
                let opts = q.options.filter(o => o !== null && o !== undefined && o.toString().trim() !== '');
                let uniqueOpts = [...new Set(opts)];
                let correctText = q.options[q.answer];
                if(uniqueOpts.length === 3) uniqueOpts.push("Barcha javoblar to'g'ri");
                
                bank.push({ id: globalId++, subject: subName, q: q.q, originalOpts: uniqueOpts, correctText: correctText });
            });
        } catch(e) { console.warn(f + " topilmadi"); }
    }
    document.getElementById('max-learned-total').innerText = `/ ${bank.length}`;
    updateDashboardStats();
}

window.onload = () => {
    loadData();
    
    // AVTOMATIK KIRISH (Authni chetlab o'tish)
    const isAuth = localStorage.getItem('pro_exam_auth');
    if (isAuth === 'true') {
        const savedName = localStorage.getItem('pro_exam_name') || '';
        document.getElementById('student-name').value = savedName;
        switchScreen('auth-screen', 'welcome-screen');
    }

    if (localStorage.getItem('theme') === 'dark') document.body.classList.replace('light-mode', 'dark-mode');
};

function toggleTheme() { 
    let isDark = document.body.classList.contains('dark-mode');
    if(isDark) { document.body.classList.replace('dark-mode', 'light-mode'); localStorage.setItem('theme', 'light'); }
    else { document.body.classList.replace('light-mode', 'dark-mode'); localStorage.setItem('theme', 'dark'); }
}

function switchScreen(hideId, showId) {
    forceCloseAllModals();
    document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
    const target = document.getElementById(showId);
    target.classList.remove('hidden'); target.classList.add('active');
}

function handleLogin() {
    const name = document.getElementById('student-name').value.trim();
    if(name.length < 2) return alert("Ismingizni kiriting!");
    currentUser = name; document.getElementById('display-name').innerText = name;
    if(audioCtx.state === 'suspended') audioCtx.resume();
    document.getElementById('global-nav').classList.remove('hidden');
    switchScreen('welcome-screen', 'dashboard-screen');
}

function goHome() { 
    clearInterval(timerInterval); forceCloseAllModals();
    document.getElementById('exit-test-btn').classList.add('hidden');
    document.getElementById('exam-timer').classList.add('hidden');
    switchScreen('test-screen', 'dashboard-screen'); 
    updateDashboardStats(); 
}
function confirmExit() { if(confirm("Testdan chiqishni xohlaysizmi?")) goHome(); }
function logout() { 
    if(confirm("Tizimdan to'liq chiqishni xohlaysizmi?")) {
        localStorage.removeItem('pro_exam_auth');
        location.reload(); 
    }
}

function updateDashboardStats() {
    stats.learned = [...new Set(stats.learned)]; stats.errors = [...new Set(stats.errors)];
    localStorage.setItem('adham_pro_stats', JSON.stringify(stats));
    document.getElementById('learned-count').innerText = stats.learned.length;
    document.getElementById('error-count').innerText = stats.errors.length;
    document.getElementById('error-work-btn').disabled = stats.errors.length === 0;
}

function openLevels(sub, title) {
    forceCloseAllModals(); pendingSubject = sub; document.getElementById('modal-subject-title').innerText = title;
    const grid = document.getElementById('level-grid-box'); grid.innerHTML = '';
    let subQs = bank.filter(q => q.subject === sub);
    for(let i=0; i<10; i++) {
        let start = i * 20; let end = start + 20;
        if(start >= subQs.length) break;
        let btn = document.createElement('button'); btn.className = 'lvl-btn';
        let learned = subQs.slice(start, end).filter(q => stats.learned.includes(q.id)).length;
        let isFull = learned === (end - start);
        btn.innerHTML = `<b>${i+1}-LVL</b> <span style="font-size:0.8rem; color:${isFull ? 'var(--success)' : 'var(--text-sec)'}">${learned}/${end-start} ✅</span>`;
        btn.onclick = () => { pendingLevelQs = subQs.slice(start, end); testType = 'level'; openSetup(); };
        grid.appendChild(btn);
    }
    document.getElementById('modal-level').style.display = 'flex';
}

function openChapters() {
    forceCloseAllModals(); const grid = document.getElementById('chapters-grid-box'); grid.innerHTML = '';
    const cleanBank = [...bank].sort((a,b) => a.id - b.id);
    const chunks = Math.ceil(cleanBank.length / 20);
    for(let i=0; i<chunks; i++) {
        let start = i * 20; let end = Math.min(start + 20, cleanBank.length);
        let chunkQs = cleanBank.slice(start, end);
        let learned = chunkQs.filter(q => stats.learned.includes(q.id)).length;
        let isFull = learned === (end - start);
        let btn = document.createElement('button'); btn.className = 'lvl-btn';
        btn.innerHTML = `Bob: ${start+1}-${end} <span style="font-size:0.8rem; color:${isFull ? 'var(--success)' : 'var(--warning)'}">${learned}/${end - start} ✅</span>`;
        btn.onclick = () => { pendingLevelQs = chunkQs; testType = 'chapter'; openSetup(); };
        grid.appendChild(btn);
    }
    document.getElementById('modal-chapters').style.display = 'flex';
}

function prepareTest(type) {
    forceCloseAllModals();
    if (type === 'errors' && stats.errors.length === 0) return alert("Xatolar topilmadi!");
    testType = type; openSetup();
}

function openSetup() { forceCloseAllModals(); document.getElementById('setup-screen').style.display = 'flex'; }

function setDifficulty(level, btn) {
    document.querySelectorAll('.difficulty-control .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if(level === 'easy') diffTime = 1200; if(level === 'medium') diffTime = 900; if(level === 'hard') diffTime = 600; 
}
function setOrder(mode, btn) {
    document.querySelectorAll('.order-control .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); orderMode = mode;
}

function applySetup() {
    forceCloseAllModals(); isExamMode = false; let pool = []; 
    let cleanBank = [...bank].sort((a,b) => a.id - b.id);

    if(testType === 'level' || testType === 'chapter') pool = [...pendingLevelQs];
    else if(testType === 'mix_800') pool = [...cleanBank].sort(() => Math.random() - 0.5).slice(0, 20);
    else if(testType === 'errors') pool = cleanBank.filter(q => stats.errors.includes(q.id));
    else if(testType === 'sub_mix') pool = cleanBank.filter(q => q.subject === pendingSubject).sort(() => Math.random()-0.5).slice(0, 20);
    
    if(orderMode === 'random') pool = pool.sort(() => Math.random() - 0.5);
    else pool = pool.sort((a,b) => a.id - b.id);

    currentTest = pool; startTestSession();
}

function startExamMode() {
    forceCloseAllModals(); testType = 'exam'; isExamMode = true; let examQs = [];
    const subjects = ['musiqa_nazariyasi', 'cholgu_ijrochiligi', 'vokal_ijrochiligi', 'metodika_repertuar'];
    subjects.forEach(sub => { let sQs = bank.filter(q => q.subject === sub).sort(() => Math.random() - 0.5).slice(0, 15); examQs = examQs.concat(sQs); });
    currentTest = examQs.sort(() => Math.random() - 0.5); diffTime = 3600; startTestSession();
}

function startTestSession() {
    switchScreen('dashboard-screen', 'test-screen'); document.getElementById('exit-test-btn').classList.remove('hidden'); document.getElementById('exam-timer').classList.remove('hidden');
    currentIdx = 0; currentIndex = 0; userAnswers = new Array(currentTest.length).fill(null);
    
    currentTest = currentTest.map(q => {
        let shuffledOpts = [...q.originalOpts].sort(() => Math.random() - 0.5);
        return { ...q, options: shuffledOpts, answer: shuffledOpts.indexOf(q.correctText) };
    });

    clearInterval(timerInterval); startTimer(diffTime);
    renderMap(); renderAllQuestions();
}

function startTimer(seconds) {
    let time = seconds;
    timerInterval = setInterval(() => {
        time--; let m = Math.floor(time / 60), s = time % 60;
        document.getElementById('exam-timer').innerText = `${m}:${s < 10 ? '0'+s : s}`;
        if (time <= 0) { clearInterval(timerInterval); showResult(userAnswers.filter(a => a?.isCorrect).length); }
    }, 1000);
}

function renderMap() {
    document.getElementById('indicator-map').innerHTML = currentTest.map((_, i) => `<div class="dot" id="dot-${i}" onclick="goTo(${i})">${i+1}</div>`).join('');
}

function renderAllQuestions() {
    const area = document.getElementById('all-questions-area');
    area.innerHTML = currentTest.map((q, idx) => `
        <div class="q-block ${idx === currentIndex ? 'active-q' : 'blurred-q'}" id="q-block-${idx}">
            <div class="q-meta">
                <div class="spin-box" id="spin-${idx}">${idx+1}</div>
                Savol ${idx+1} / ${currentTest.length}
            </div>
            <div class="q-text">${q.q}</div>
            <div class="options-box" id="opts-${idx}">
                ${q.options.map((opt, optIdx) => `
                    <button class="option-btn" id="btn-${idx}-${optIdx}" onclick="checkAns(${idx}, ${optIdx}, event)" ${userAnswers[idx] ? 'disabled' : ''}>
                        ${opt}
                    </button>
                `).join('')}
            </div>
        </div>
    `).join('');
    updateMap(); scrollToActive(); runSpin(currentIndex);
}

function runSpin(idx) {
    const spin = document.getElementById(`spin-${idx}`); if(!spin) return;
    let sc = 0; let si = setInterval(() => { spin.innerText = Math.floor(Math.random() * currentTest.length) + 1; if(++sc > 8) { clearInterval(si); spin.innerText = idx + 1; } }, 40);
}

function updateFocus() {
    for(let i = 0; i < currentTest.length; i++) {
        const block = document.getElementById(`q-block-${i}`);
        if(block) { if(i === currentIndex) { block.classList.remove('blurred-q'); block.classList.add('active-q'); runSpin(i); } else { block.classList.remove('active-q'); block.classList.add('blurred-q'); } }
    }
    scrollToActive(); updateMap();
}

function scrollToActive() {
    const activeBlock = document.getElementById(`q-block-${currentIndex}`);
    if (activeBlock) activeBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const activeDot = document.getElementById(`dot-${currentIndex}`);
    if(activeDot) activeDot.scrollIntoView({ behavior: 'smooth', inline: 'center' });
}

function updateMap() {
    let answered = userAnswers.filter(a => a !== null).length;
    document.getElementById('progress-fill').style.width = `${(answered / currentTest.length) * 100}%`;
    currentTest.forEach((_, i) => {
        const dot = document.getElementById(`dot-${i}`);
        if(dot) { dot.className = 'dot'; if (i === currentIndex) dot.classList.add('active-dot'); if (userAnswers[i]) dot.classList.add(userAnswers[i].isCorrect ? 'correct' : 'wrong'); }
    });
}

function checkAns(qIdx, optIdx, event) {
    if (qIdx !== currentIndex || userAnswers[qIdx]) return;
    const isCorrect = optIdx === currentTest[qIdx].answer; userAnswers[qIdx] = { selected: optIdx, isCorrect };
    const qId = currentTest[qIdx].id; const clickedBtn = document.getElementById(`btn-${qIdx}-${optIdx}`);
    
    if (isCorrect) {
        if (!stats.learned.includes(qId)) stats.learned.push(qId);
        stats.errors = stats.errors.filter(id => id !== qId); 
        clickedBtn.classList.add('magic-correct'); playFeedback('correct'); createParticles(event);
    } else {
        if (!stats.errors.includes(qId)) stats.errors.push(qId);
        clickedBtn.classList.add('magic-wrong'); playFeedback('wrong');
    }
    
    localStorage.setItem('adham_pro_stats', JSON.stringify(stats));
    const options = document.getElementById(`opts-${qIdx}`).getElementsByTagName('button');
    for(let btn of options) btn.disabled = true;

    if (userAnswers.filter(a => a !== null).length === currentTest.length) document.getElementById('finish-btn').classList.remove('hidden');

    setTimeout(() => { 
        let next = userAnswers.findIndex(ans => ans === null); 
        if (next !== -1) { currentIndex = next; updateFocus(); } 
    }, 800);
}

function move(step) { let n = currentIndex + step; if (n >= 0 && n < currentTest.length) { currentIndex = n; updateFocus(); } }
function goTo(i) { currentIndex = i; updateFocus(); }

function finishExam() {
    clearInterval(timerInterval);
    let correctCount = userAnswers.filter(a => a?.isCorrect).length;
    if(!isExamMode && correctCount < currentTest.length) {
        alert(`Natija: ${correctCount}/${currentTest.length}. Qoidaga ko'ra, 100% to'g'ri bo'lmaguncha ushbu savollar aralashtirib qayta beriladi.`);
        currentTest = shuffleArray(currentTest).map(q => {
            let correctText = q.options[q.answer]; let shuffledOpts = shuffleArray([...q.options]);
            return { ...q, options: shuffledOpts, answer: shuffledOpts.indexOf(correctText) };
        });
        userAnswers = new Array(currentTest.length).fill(null); currentIndex = 0; startTimer(diffTime); renderAllQuestions(); document.getElementById('finish-btn').classList.add('hidden');
    } else {
        showResult(correctCount);
    }
}
function shuffleArray(arr) { return arr.sort(() => Math.random() - 0.5); }

function showResult(correctCount) {
    let percent = Math.round((correctCount / currentTest.length) * 100);
    document.getElementById('result-percent').innerText = `${percent}%`;
    let msg = "", color = "";
    if(percent >= 90) { msg = "Sehrli natija! Imtihonga to'liq tayyorsiz. 🏆"; color = "var(--success)"; confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });}
    else if(percent >= 70) { msg = "Yaxshi natija, lekin biroz mashq qiling. 👍"; color = "var(--primary)"; }
    else if(percent >= 50) { msg = "Ko'rdingizmi? Yana urinib ko'ring! 📚"; color = "var(--warning)"; }
    else { msg = "Ko'proq mashq kerak! Xatolar ustida ishlang. ⚠️"; color = "var(--error)"; }

    document.getElementById('result-msg').innerText = msg;
    document.getElementById('result-donut').style.borderColor = color;
    document.getElementById('result-donut').style.boxShadow = `0 0 30px ${color}`;
    document.getElementById('result-percent').style.color = color;
    forceCloseAllModals(); document.getElementById('modal-result').style.display = 'flex';
}
