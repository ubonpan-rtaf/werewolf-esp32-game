/* ==========================================================
   WEREWOLF LEGENDS: ALGORITHM & LOGIC (FIXED GM & TIMER)
   ========================================================== */

function showToast(msg, type='normal') {
    const c = document.getElementById('toast-container'); const t = document.createElement('div');
    t.className = `custom-toast ${type}`; t.innerHTML = `<span>${type==='error'?'❌':type==='warning'?'🚨':type==='mystic'?'🔮':'🔔'}</span> <div>${msg}</div>`;
    c.appendChild(t); setTimeout(() => { if(c.contains(t)) c.removeChild(t); }, 3500);
}

const firebaseConfig = {
    apiKey: "AIzaSyCwgLaNKEBORncza75PO4IrGxTrF8vKoQw", authDomain: "werewolf-esp32-game.firebaseapp.com",
    projectId: "werewolf-esp32-game", databaseURL: "https://werewolf-esp32-game-default-rtdb.asia-southeast1.firebasedatabase.app"
};
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.database();

let myPlayerId = localStorage.getItem("ww_player_id") || "player_" + Date.now();
localStorage.setItem("ww_player_id", myPlayerId);

let currentRoom = ""; let isHost = false; let myRole = "villager"; let myTrust = 0; let wasInterrogated = false; let isDead = false;
let phaseEndTime = 0; let timerInterval = null; let lastState = "";

const bgm = new Audio('wolf-music.mp3'); bgm.loop = true; bgm.volume = 0.3; let isBgmPlaying = false;
const winWolfAudio = new Audio('https://actions.google.com/sounds/v1/horror/monster_snarl.ogg');
const winVillagerAudio = new Audio('https://actions.google.com/sounds/v1/crowds/crowd_cheer.ogg');
const npcVoices = { 'role_reveal': new Audio('npc-role.mp3'), 'night_phase': new Audio('npc-night.mp3'), 'day_phase': new Audio('npc-day.mp3'), 'voting_phase': new Audio('npc-vote.mp3') };
let currentNpcAudio = null;

function playSound(type) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    if(type === 'click') { osc.frequency.setValueAtTime(440, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime+0.1); gain.gain.setValueAtTime(0.05, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+0.1); osc.start(); osc.stop(audioCtx.currentTime+0.1); }
    else if(type === 'alert') { osc.frequency.setValueAtTime(261.63, audioCtx.currentTime); osc.frequency.setValueAtTime(392.00, audioCtx.currentTime+0.15); gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+0.35); osc.start(); osc.stop(audioCtx.currentTime+0.35); }
}

function playNpcVoice(phase) {
    if (currentNpcAudio) { currentNpcAudio.pause(); currentNpcAudio.currentTime = 0; }
    if (npcVoices[phase]) {
        if (isBgmPlaying) bgm.volume = 0.05;
        currentNpcAudio = npcVoices[phase]; currentNpcAudio.play().catch(e => {});
        currentNpcAudio.onended = () => { if (isBgmPlaying) bgm.volume = document.getElementById("vol-slider").value; };
    }
}

function changeVolume(val) { bgm.volume = parseFloat(val); }
function toggleBGM() {
    playSound('click'); const status = document.getElementById("bgm-status");
    if(isBgmPlaying){ bgm.pause(); isBgmPlaying=false; if(status) status.innerText="ปิด"; showToast("ปิดเพลงประกอบแล้ว"); } 
    else { bgm.play(); isBgmPlaying=true; if(status) status.innerText="เปิด"; showToast("เปิดเพลงประกอบแล้ว"); }
}
function enterGameWorld() {
    playSound('click'); bgm.play().then(() => { isBgmPlaying = true; }).catch(e => {});
    const intro = document.getElementById("intro-screen");
    intro.style.transition = "opacity 0.8s ease"; intro.style.opacity = "0";
    setTimeout(() => { intro.style.display = "none"; }, 800);
}
function openManual() { playSound('click'); document.getElementById("manual-modal").style.display = "flex"; }
function closeManual() { playSound('click'); document.getElementById("manual-modal").style.display = "none"; }

db.ref("werewolf_rooms").on("value", snap => {
    const select = document.getElementById("room-select"); if(!select) return;
    select.innerHTML = '<option value="NEW">➕ สร้างห้องใหม่ (Host New Server)</option>';
    if(snap.exists()) {
        snap.forEach(r => {
            if(r.val().system && r.val().system.gameState === "lobby") {
                let opt = document.createElement("option"); opt.value = r.key; opt.innerText = `🎮 ห้อง: [ ${r.key} ] (รอคนเล่น)`;
                select.appendChild(opt);
            }
        });
    }
});

function onRoomSelectChange() {
    const val = document.getElementById("room-select").value;
    document.getElementById("room-id").value = val !== "NEW" ? val : "";
}

async function joinRoom() {
    playSound('click');
    const name = document.getElementById("player-name").value.trim();
    let roomInput = document.getElementById("room-id").value.trim().toUpperCase();
    if(!name) return showToast("กรุณาระบุฉายานักรบ!", "error");
    
    if(!roomInput || roomInput === "NEW") {
        roomInput = Math.random().toString(36).substring(2, 6).toUpperCase();
        isHost = true;
        await db.ref(`werewolf_rooms/${roomInput}/system`).set({ gameState: "lobby", hostId: myPlayerId, phaseEndTime: 0 });
    } else {
        const roomSnap = await db.ref(`werewolf_rooms/${roomInput}/system`).once("value");
        if(!roomSnap.exists()) return showToast("ไม่พบห้องนี้ หรือห้องกำลังเล่นอยู่!", "error");
        if(roomSnap.val().hostId === myPlayerId) isHost = true;
    }

    currentRoom = roomInput;
    await db.ref(`werewolf_rooms/${currentRoom}/players/${myPlayerId}`).set({ name: name, role: "waiting", isAlive: true, trust: 0 });
    
    document.getElementById("lobby-screen").style.display = "none";
    document.getElementById("game-screen").style.display = "flex";
    document.getElementById("room-display").innerText = "ROOM: " + currentRoom;
    
    // โชว์ปุ่ม 👑 เฉพาะคนเป็น Host
    if(isHost) { document.getElementById("gm-toggle-btn").style.display = "flex"; }
    
    listenToGame();
    showToast("เข้าสู่ห้องสำเร็จ!", "normal");
}

function leaveRoom() {
    if(confirm("ต้องการออกจากเกม และกลับหน้าหลักใช่หรือไม่?")) {
        playSound('alert');
        db.ref(`werewolf_rooms/${currentRoom}/players/${myPlayerId}`).remove();
        window.location.reload();
    }
}

function listenToGame() {
    db.ref(`werewolf_rooms/${currentRoom}/pranks/${myPlayerId}`).on("value", snap => {
        if (snap.exists() && snap.val() !== "") {
            showToast(`🚨 คุณถูก [${snap.val()}] เค้นความจริง!`, "warning");
            wasInterrogated = true;
            db.ref(`werewolf_rooms/${currentRoom}/pranks/${myPlayerId}`).remove();
        }
    });

    db.ref(`werewolf_rooms/${currentRoom}/system`).on("value", snap => {
        const sys = snap.val(); 
        if(!sys) { alert("สภาล่ม (Host สั่งยุบห้อง) ระบบจะพากลับหน้าหลัก"); window.location.reload(); return; }
        const state = sys.gameState; phaseEndTime = sys.phaseEndTime || 0;
        
        if(state !== lastState) { playNpcVoice(state); lastState = state; updateGameUI(state); }
        startTimer();
    });

    db.ref(`werewolf_rooms/${currentRoom}/players/${myPlayerId}`).on("value", snap => {
        const me = snap.val(); if(!me) return;
        myRole = me.role; isDead = !me.isAlive; myTrust = me.trust || 0;
        
        const img = document.getElementById("role-image"); const roleEl = document.getElementById("my-role");
        const trustCont = document.getElementById("trust-container"); const trustVal = document.getElementById("trust-val");
        document.getElementById("trust-bar").style.width = myTrust + "%";

        if(isDead) {
            img.src = "img-ghost.jpg"; roleEl.innerText = "วิญญาณผู้ล่วงลับ"; roleEl.style.color = "#a4b0be"; trustCont.style.display = "none";
        } else {
            trustCont.style.display = "block"; trustVal.innerText = myTrust;
            if(myRole === "wolf") { img.src = "img-wolf.jpg"; roleEl.innerText = "Crimson Lycan"; roleEl.style.color = "#ff4757"; }
            else if(myRole === "seer") { img.src = "img-seer.jpg"; roleEl.innerText = "Cyber Oracle"; roleEl.style.color = "#9b59b6"; }
            else if(myRole === "guardian") { img.src = "img-guardian.jpg"; roleEl.innerText = "Aegis Guardian"; roleEl.style.color = "#3498db"; }
            else if(myRole === "alchemist") { img.src = "img-alchemist.jpg"; roleEl.innerText = "Dark Alchemist"; roleEl.style.color = "#e67e22"; }
            else { img.src = "img-villager.jpg"; roleEl.innerText = "Citizen"; roleEl.style.color = "#2ed573"; }
        }
    });
}

// ================= 🔥 แผงควบคุม GAME MASTER (Modal) 🔥 =================
function toggleGMPanel() { 
    playSound('click'); 
    const panel = document.getElementById('gm-modal'); 
    panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex'; 
}

async function gmStartGame() {
    playSound('click'); toggleGMPanel();
    await assignRoles();
    await db.ref(`werewolf_rooms/${currentRoom}/system`).update({ gameState: "role_reveal", phaseEndTime: Date.now() + 12000 });
    showToast("เริ่มเกมแล้ว!", "normal");
}

async function gmNextPhase() { playSound('click'); toggleGMPanel(); forceNextPhase(); }

function gmAddBot() {
    playSound('click'); toggleGMPanel();
    let botId = "bot_" + Date.now(); let botName = "Hero_Bot_" + Math.floor(Math.random()*90+10);
    db.ref(`werewolf_rooms/${currentRoom}/players/${botId}`).set({ name: botName, role: "waiting", isAlive: true, trust: 0 });
    showToast(`เพิ่มบอท ${botName} สำเร็จ!`, "normal");
}

async function gmResetGame() {
    toggleGMPanel();
    if(confirm("ต้องการยุบห้องนี้ใช่หรือไม่? ทุกคนจะเด้งออกทันที!")) {
        playSound('alert');
        await db.ref(`werewolf_rooms/${currentRoom}`).remove();
    }
}

// ================= ⏳ ระบบ Auto-Timer =================
function startTimer() {
    clearInterval(timerInterval);
    const tBox = document.getElementById("timer-box"); const tBar = document.getElementById("timer-bar"); const tText = document.getElementById("timer-text");
    if(lastState === "lobby" || lastState === "wolf_win" || lastState === "villager_win") { tBox.style.display = "none"; return; }
    tBox.style.display = "block";

    let maxDuration = 30000;
    if(lastState==="night_phase") maxDuration = 25000;
    if(lastState==="result_phase" || lastState==="role_reveal") maxDuration = 15000;

    timerInterval = setInterval(() => {
        let timeLeft = phaseEndTime - Date.now();
        if(timeLeft <= 0) { timeLeft = 0; clearInterval(timerInterval); if(isHost) forceNextPhase(); }
        let pct = (timeLeft / maxDuration) * 100; if(pct < 0) pct = 0;
        tBar.style.width = pct + "%"; tText.innerText = `เหลือเวลา: ${Math.ceil(timeLeft/1000)} วิ`;
        tBar.style.background = pct < 30 ? "#ff4757" : "linear-gradient(90deg, #ff4757, #ff8c00, #ffd700)";
    }, 1000);
}

let isProcessing = false;
async function forceNextPhase() {
    if(!isHost || isProcessing) return;
    isProcessing = true; let next = "lobby"; let duration = 0;
    
    if(lastState === "lobby" || lastState === "wolf_win" || lastState === "villager_win") { await assignRoles(); next = "role_reveal"; duration = 12000; }
    else if(lastState === "role_reveal") { next = "night_phase"; duration = 25000; }
    else if(lastState === "night_phase") { next = "day_phase"; duration = 30000; }
    else if(lastState === "day_phase") { next = "voting_phase"; duration = 20000; }
    else if(lastState === "voting_phase") { next = "result_phase"; duration = 15000; }
    else if(lastState === "result_phase") { next = await checkWin(); duration = 15000; }

    await db.ref(`werewolf_rooms/${currentRoom}/system`).update({ gameState: next, phaseEndTime: Date.now() + duration });
    setTimeout(() => { isProcessing = false; }, 1000);
}

async function assignRoles() {
    const snap = await db.ref(`werewolf_rooms/${currentRoom}/players`).once("value");
    let p = snap.val(); if(!p) return; let keys = Object.keys(p);
    for(let i = keys.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
    let up = {};
    keys.forEach((k, idx) => {
        let r = "villager"; 
        if(idx === 0) r = "wolf"; else if(idx === 1 && keys.length >= 3) r = "seer"; else if(idx === 2 && keys.length >= 4) r = "guardian"; else if(idx === 3 && keys.length >= 5) r = "alchemist";
        up[`werewolf_rooms/${currentRoom}/players/${k}/role`] = r; up[`werewolf_rooms/${currentRoom}/players/${k}/isAlive`] = true; up[`werewolf_rooms/${currentRoom}/players/${k}/trust`] = 0;
    });
    await db.ref().update(up);
    await db.ref(`werewolf_rooms/${currentRoom}/votes`).remove(); await db.ref(`werewolf_rooms/${currentRoom}/wolf_kills`).remove(); await db.ref(`werewolf_rooms/${currentRoom}/guardian_shields`).remove();
}

async function checkWin() {
    const snap = await db.ref(`werewolf_rooms/${currentRoom}/players`).once("value");
    let p = snap.val(); let w=0, v=0;
    for(let k in p) { if(p[k].isAlive){ if(p[k].role==='wolf') w++; else v++; } }
    await db.ref(`werewolf_rooms/${currentRoom}/votes`).remove(); await db.ref(`werewolf_rooms/${currentRoom}/wolf_kills`).remove(); await db.ref(`werewolf_rooms/${currentRoom}/guardian_shields`).remove();
    if(w === 0 && v > 0) return "villager_win"; 
    if(w >= v && w > 0) return "wolf_win";
    return "night_phase";
}

function updateGameUI(state) {
    const ind = document.getElementById("phase-indicator"); const txt = document.getElementById("npc-text");
    const actionArea = document.getElementById("action-area"); const voteArea = document.getElementById("vote-result-area");
    const mainContainer = document.getElementById("main-container");
    actionArea.innerHTML = ""; voteArea.innerHTML = ""; mainContainer.classList.remove("epic-win-wolf", "epic-win-villager");
    
    if(state==="role_reveal") { ind.innerText="สถานะ: แจกบทบาท"; txt.innerText="ชะตากรรมของท่านถูกกำหนดแล้ว จงจดจำบทบาทของตนไว้ให้ดี..."; }
    else if(state==="night_phase") { 
        ind.innerText="🌙 ราตรีกาล"; txt.innerText="ความมืดเข้าปกคลุมหมู่บ้าน ผู้มีหน้าที่จงปฏิบัติภารกิจ..."; 
        if(!isDead) loadActions(actionArea, myRole==='wolf'?'kill':myRole==='seer'?'seer':myRole==='guardian'?'protect':myRole==='alchemist'?'potion':'none');
    }
    else if(state==="day_phase") { ind.innerText="☀️ แสงอรุณรุ่งสว่าง"; txt.innerText="รุ่งอรุณมาถึง สำรวจความเสียหายและใช้สกิลเค้นความจริง!"; showKills(voteArea); if(!isDead) loadActions(actionArea, "prank"); }
    else if(state==="voting_phase") { ind.innerText="⚖️ การพิพากษาแห่งสภา"; txt.innerText="เวลาแห่งการโหวตประหารมาถึงแล้ว!"; if(!isDead) loadActions(actionArea, "vote"); }
    else if(state==="result_phase") { ind.innerText="📜 ผลคำพิพากษา"; txt.innerText="สภาได้ตัดสินแล้ว..."; showVotes(voteArea); }
    else if(state==="wolf_win") { ind.innerText="🩸 อวสาน"; txt.innerText="หมาป่ากลืนกินทุกสิ่ง!"; mainContainer.classList.add("epic-win-wolf"); winWolfAudio.play().catch(e=>{}); }
    else if(state==="villager_win") { ind.innerText="✨ ชัยชนะ"; txt.innerText="แสงสว่างชนะความมืด!"; mainContainer.classList.add("epic-win-villager"); winVillagerAudio.play().catch(e=>{}); }
}

async function loadActions(container, mode) {
    if(mode==='none') return;
    const snap = await db.ref(`werewolf_rooms/${currentRoom}/players`).once("value"); let p = snap.val();
    for(let k in p) {
        if((mode !== 'protect' && k !== myPlayerId) || mode === 'protect') {
            if(p[k].isAlive) {
                const btn = document.createElement("button"); btn.className = mode==="prank" ? "target-btn btn-prank" : "target-btn";
                btn.innerText = mode==="kill"?"🎯 ล่าเหยื่อ: "+p[k].name : mode==="seer"?"🔮 ส่องความจริง: "+p[k].name : mode==="protect"?"🛡️ ปกป้อง: "+p[k].name : mode==="potion"?"🧪 ปรุงยา: "+p[k].name : mode==="prank"?"👉 เค้นความจริง: "+p[k].name : "⚖️ โหวตประหาร: "+p[k].name;
                btn.onclick = () => {
                    playSound('click'); btn.style.background = "#c5a059"; btn.style.color = "#000"; btn.innerText = "บันทึกคำสั่งแล้ว"; btn.disabled = true;
                    if(mode==="kill") db.ref(`werewolf_rooms/${currentRoom}/wolf_kills/${k}`).set(true);
                    else if(mode==="vote") db.ref(`werewolf_rooms/${currentRoom}/votes/${myPlayerId}`).set(k);
                    else if(mode==="protect") { db.ref(`werewolf_rooms/${currentRoom}/guardian_shields/${k}`).set(true); showToast(`ร่ายเวทย์ปกป้อง ${p[k].name} เรียบร้อย!`, "mystic"); }
                    else if(mode==="potion") showToast(`ใช้พลังปรุงยาใส่ ${p[k].name}!`, "error");
                    else if(mode==="prank") { db.ref(`werewolf_rooms/${currentRoom}/pranks/${k}`).set("เพื่อนร่วมทีม"); showToast(`ส่งคำท้าไปหา ${p[k].name}!`, "warning"); }
                    else if(mode==="seer") showToast(`${p[k].name} คือ [${p[k].role==='wolf'?'หมาป่า 🐺':'ฝ่ายดี ✨'}]`, "mystic");
                }; container.appendChild(btn);
            }
        }
    }
}

async function showKills(container) {
    const shieldSnap = await db.ref(`werewolf_rooms/${currentRoom}/guardian_shields`).once("value"); const shields = shieldSnap.val() || {};
    const killSnap = await db.ref(`werewolf_rooms/${currentRoom}/wolf_kills`).once("value");
    const pSnap = await db.ref(`werewolf_rooms/${currentRoom}/players`).once("value"); const ps = pSnap.val() || {};
    
    let deadNames = []; let savedNames = [];
    if(killSnap.exists()) {
        killSnap.forEach(c => { 
            let tId = c.key;
            if(ps[tId]) {
                if(shields[tId]) savedNames.push(ps[tId].name);
                else {
                    deadNames.push(ps[tId].name); 
                    if(tId === myPlayerId) { db.ref(`werewolf_rooms/${currentRoom}/players/${tId}/isAlive`).set(false); db.ref(`werewolf_rooms/${currentRoom}/players/${tId}/trust`).set(0); }
                }
            }
        });
    }
    let h = "";
    if(deadNames.length > 0) h += `<div class='vote-result-box' style='border-color:#ff4757;'>💀 ผู้เสียชีวิต: <b>${deadNames.join(", ")}</b></div>`;
    if(savedNames.length > 0) h += `<div class='vote-result-box' style='border-color:#3498db; margin-top:5px;'>🛡️ อัศวินปกป้อง <b>${savedNames.join(", ")}</b> ไว้ได้!</div>`;
    if(deadNames.length === 0 && savedNames.length === 0) h = `<div class='vote-result-box' style='border-color:#2ed573;'>รุ่งเช้านี้... ไม่มีใครเสียชีวิต หมู่บ้านปลอดภัย!</div>`;
    container.innerHTML = h;
}

async function showVotes(container) {
    const snap = await db.ref(`werewolf_rooms/${currentRoom}/votes`).once("value");
    if(!snap.exists()) {
        container.innerHTML = `<div class='vote-result-box' style='border-color:#2ed573;'>ไม่มีใครถูกโหวต... ทุกคนรอด!</div>`;
        if (wasInterrogated && myRole !== 'wolf') { myTrust+=5; db.ref(`werewolf_rooms/${currentRoom}/players/${myPlayerId}/trust`).set(myTrust); showToast("✨ รอดพ้นข้อครหา Trust +5%", "mystic"); wasInterrogated=false; }
        return;
    }
    const votes = snap.val(); let tally={}; Object.values(votes).forEach(v => tally[v]=(tally[v]||0)+1);
    let max=0, target=null, isTie=false; 
    for(let id in tally){ if(tally[id]>max){ max=tally[id]; target=id; isTie=false; } else if(tally[id]===max) isTie=true; }

    if(isTie || !target) { container.innerHTML = `<div class='vote-result-box' style='border-color:#ffd700;'>⚖️ มติสภาเสียงเท่ากัน... ไม่มีผู้ใดถูกขับไล่!</div>`; return; }

    const pSnap = await db.ref(`werewolf_rooms/${currentRoom}/players/${target}`).once("value"); const p = pSnap.val();
    container.innerHTML = `<div class='vote-result-box'>มติสภา (${max} เสียง) ขับไล่ <div class='vote-winner'>${p.name}</div><hr style='border:1px solid rgba(255,255,255,0.1); margin:8px 0;'>ความจริง: <b>${p.name} คือ ${p.role==='wolf'?'<span style="color:#ff4757">หมาป่า! 🐺</span>':'<span style="color:#2ed573">ผู้บริสุทธิ์... 🧑</span>'}</b></div>`;
    
    if(target === myPlayerId) { db.ref(`werewolf_rooms/${currentRoom}/players/${target}/isAlive`).set(false); wasInterrogated = false; } 
    else if(wasInterrogated && myRole !== 'wolf') { myTrust+=5; db.ref(`werewolf_rooms/${currentRoom}/players/${myPlayerId}/trust`).set(myTrust); showToast("✨ รอดพ้นข้อครหา Trust +5%", "mystic"); wasInterrogated = false; }
}
