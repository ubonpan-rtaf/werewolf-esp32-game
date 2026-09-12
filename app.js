function showToast(message, type = 'normal') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `custom-toast ${type}`;
    let icon = type === 'error' ? '❌' : type === 'warning' ? '🚨' : type === 'mystic' ? '🔮' : '🔔';
    toast.innerHTML = `<span style="font-size:18px;">${icon}</span> <div>${message}</div>`;
    container.appendChild(toast);
    playSound('alert');
    setTimeout(() => { if (container.contains(toast)) container.removeChild(toast); }, 4000);
}

const firebaseConfig = {
    apiKey: "AIzaSyCwgLaNKEBORncza75PO4IrGxTrF8vKoQw",
    authDomain: "werewolf-esp32-game.firebaseapp.com",
    projectId: "werewolf-esp32-game",
    storageBucket: "werewolf-esp32-game.firebasestorage.app",
    messagingSenderId: "768089473466",
    appId: "1:768089473466:web:b9196bc05fa83144c39d83",
    databaseURL: "https://werewolf-esp32-game-default-rtdb.asia-southeast1.firebasedatabase.app"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let myPlayerId = localStorage.getItem("werewolf_player_id") || "player_" + Date.now();
localStorage.setItem("werewolf_player_id", myPlayerId);
let hasJoined = false; 
let myRole = "villager"; 
let myTrust = 0; 
let wasInterrogated = false;

const bgmMusic = new Audio('wolf-music.mp3'); 
bgmMusic.loop = true; 
bgmMusic.volume = 0.4;
let isMusicPlaying = false; 
let currentVol = 0.4; 
let currentNpcAudio = null;

const npcVoices = { 
    'role_reveal': new Audio('npc-role.mp3'), 
    'night_phase': new Audio('npc-night.mp3'), 
    'day_phase': new Audio('npc-day.mp3'), 
    'voting_phase': new Audio('npc-vote.mp3'), 
    'result_phase': new Audio('npc-result.mp3') 
};

const winWolfAudio = new Audio('https://actions.google.com/sounds/v1/horror/monster_snarl.ogg');
const winVillagerAudio = new Audio('https://actions.google.com/sounds/v1/crowds/crowd_cheer.ogg');
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); 
    const gain = audioCtx.createGain();
    osc.connect(gain); 
    gain.connect(audioCtx.destination);
    
    if (type === 'click') { 
        osc.frequency.setValueAtTime(440, audioCtx.currentTime); 
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1); 
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime); 
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1); 
        osc.start(); 
        osc.stop(audioCtx.currentTime + 0.1); 
    } else if (type === 'alert') { 
        osc.frequency.setValueAtTime(261.63, audioCtx.currentTime); 
        osc.frequency.setValueAtTime(392.00, audioCtx.currentTime + 0.15); 
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime); 
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35); 
        osc.start(); 
        osc.stop(audioCtx.currentTime + 0.35); 
    }
}

function changeVolume(val) { 
    currentVol = parseFloat(val); 
    bgmMusic.volume = currentVol; 
}

function playNpcVoice(phase) {
    if (currentNpcAudio) { 
        currentNpcAudio.pause(); 
        currentNpcAudio.currentTime = 0; 
    }
    if (npcVoices[phase]) {
        if (isMusicPlaying) bgmMusic.volume = 0.05;
        currentNpcAudio = npcVoices[phase]; 
        currentNpcAudio.play().catch(e => console.log("AutoPlay block"));
        currentNpcAudio.onended = () => { 
            if (isMusicPlaying) bgmMusic.volume = currentVol; 
        };
    } else { 
        if (isMusicPlaying) bgmMusic.volume = currentVol; 
    }
}

function toggleBGM() {
    const btn = document.getElementById("music-toggle-btn");
    if (!isMusicPlaying) { 
        bgmMusic.play(); 
        isMusicPlaying = true; 
        btn.innerText = "🔇 ปิดเพลงบรรยากาศ"; 
        btn.style.color = "#ff4757"; 
    } else { 
        bgmMusic.pause(); 
        isMusicPlaying = false; 
        btn.innerText = "🎶 เปิดเพลงบรรยากาศ"; 
        btn.style.color = "#2ed573"; 
    }
}

function enterGameWorld() {
    playSound('click'); 
    bgmMusic.play().then(() => { 
        isMusicPlaying = true; 
        const btn = document.getElementById("music-toggle-btn"); 
        if (btn) { 
            btn.innerText = "🔇 ปิดเพลงบรรยากาศ"; 
            btn.style.color = "#ff4757"; 
        } 
    }).catch(e => {});
    
    const intro = document.getElementById("intro-screen"); 
    intro.style.transition = "opacity 0.8s ease"; 
    intro.style.opacity = "0"; 
    setTimeout(() => { intro.style.display = "none"; }, 800);
}

function openManual() { 
    playSound('click'); 
    document.getElementById("manual-modal").style.display = "flex"; 
}

function closeManual() { 
    playSound('click'); 
    document.getElementById("manual-modal").style.display = "none"; 
}

function joinGame() {
    playSound('click'); 
    const nameInput = document.getElementById("player-name").value.trim();
    if (nameInput === "") return showToast("โปรดระบุฉายานักรบของคุณก่อน!", "error");
    
    db.ref("werewolf_game/players/" + myPlayerId).set({ 
        name: nameInput, 
        role: "waiting", 
        isAlive: true, 
        trust: 0 
    }).then(() => {
        hasJoined = true; 
        document.getElementById("lobby-screen").style.display = "none";
        document.getElementById("game-screen").style.display = "block"; 
        showToast("ยินดีต้อนรับเข้าสู่สมรภูมิรบ!", "normal");
    });
}

db.ref("werewolf_game/pranks/" + myPlayerId).on("value", snap => {
    if (snap.exists() && snap.val() !== "") { 
        showToast(`คุณถูก <b>[${snap.val()}]</b> เพ่งเล็งและเค้นความจริง!`, "warning"); 
        wasInterrogated = true; 
        db.ref("werewolf_game/pranks/" + myPlayerId).set(""); 
    }
});

db.ref("werewolf_game/players/" + myPlayerId).on("value", (snap) => {
   if (!snap.exists() && hasJoined) { 
       alert("สภาได้ล้างกระดานแล้ว... กลับสู่ล้อบบี้!"); 
       window.location.reload(); 
   }
});

let lastState = ""; 
let playersData = {};

db.ref("werewolf_game/system/gameState").on("value", (snapshot) => {
    const state = snapshot.val(); 
    if (!hasJoined) return;
    if (state !== lastState) { 
        playNpcVoice(state); 
        lastState = state; 
    }
    
    const phaseInd = document.getElementById("phase-indicator"); 
    const roleImg = document.getElementById("role-image");
    const roleEl = document.getElementById("my-role"); 
    const npcText = document.getElementById("npc-text");
    const actionArea = document.getElementById("action-area"); 
    const voteArea = document.getElementById("vote-result-area");
    const mainCont = document.getElementById("main-container"); 
    const pBorder = document.getElementById("portrait-border"); 
    const cardBg = document.getElementById("role-card-bg");
    const trustCont = document.getElementById("trust-container"); 
    const trustBar = document.getElementById("trust-bar"); 
    const trustVal = document.getElementById("trust-val");
    
    actionArea.innerHTML = ""; 
    voteArea.innerHTML = "";

    db.ref("werewolf_game/players").once("value", (playersSnap) => {
        playersData = playersSnap.val() || {}; 
        const me = playersData[myPlayerId]; 
        if (!me) return;
        
        myRole = me.role || "villager"; 
        myTrust = me.trust || 0;
        
        if (!me.isAlive) {
            phaseInd.innerText = "สถานะ: สิ้นชีพในสงคราม"; 
            roleImg.src = "img-ghost.jpg"; 
            roleEl.innerHTML = "วิญญาณผู้ล่วงลับ"; 
            roleEl.style.color = "#a4b0be"; 
            trustCont.style.display = "none"; 
            pBorder.style.background = "#333"; 
            cardBg.style.borderColor = "rgba(164, 176, 190, 0.3)"; 
            npcText.innerText = "ร่างของเจ้าสูญสลายไปแล้ว... ทำได้เพียงเฝ้ามองความล่มสลายของดินแดนนี้"; 
            return; 
        }

        trustCont.style.display = "block"; 
        trustBar.style.width = myTrust + "%"; 
        trustVal.innerText = myTrust;
        
        if (myRole === "wolf") { 
            roleImg.src = "img-wolf.jpg"; 
            roleEl.innerHTML = "Crimson Lycan"; 
            roleEl.style.color = "#ff4757"; 
            pBorder.style.background = "linear-gradient(135deg, #ff4757, #8e0000)"; 
            cardBg.style.borderColor = "rgba(255, 71, 87, 0.5)"; 
        } else if (myRole === "seer") { 
            roleImg.src = "img-seer.jpg"; 
            roleEl.innerHTML = "Cyber Oracle"; 
            roleEl.style.color = "#9b59b6"; 
            pBorder.style.background = "linear-gradient(135deg, #9b59b6, #4b0082)"; 
            cardBg.style.borderColor = "rgba(155, 89, 182, 0.5)"; 
        } else { 
            roleImg.src = "img-villager.jpg"; 
            roleEl.innerHTML = "Citizen"; 
            roleEl.style.color = "#2ed573"; 
            pBorder.style.background = "linear-gradient(135deg, #2ed573, #006400)"; 
            cardBg.style.borderColor = "rgba(46, 213, 115, 0.5)"; 
        }

        if (state === "role_reveal") { 
            phaseInd.innerText = "คลาสประจำตัว"; 
            npcText.innerText = myRole === "wolf" ? "ซ่อนความลับไว้ให้ลึกที่สุด เตรียมขย้ำในยามวิกาล..." : "จงหาความจริงที่ซ่อนอยู่ในเงามืดก่อนที่ทุกอย่างจะสายเกินไป!"; 
        } else if (state === "night_phase") { 
            phaseInd.innerText = "🌙 ราตรีกาลแห่งเงามืด"; 
            if (myRole === "wolf") { 
                npcText.innerText = "เลือกเหยื่อสังเวยของเจ้าในคืนนี้..."; 
                loadTargets(actionArea, "kill", playersData, me.name); 
            } else if (myRole === "seer") { 
                npcText.innerText = "เพ่งจิตมองทะลุหน้ากากของผู้ที่เจ้าสงสัย..."; 
                loadTargets(actionArea, "seer", playersData, me.name); 
            } else { 
                npcText.innerText = "ความมืดมิดปกคลุม ทุกชีวิตหลับใหล... ภาวนาอย่าให้ภัยร้ายมาเยือน"; 
            } 
        } else if (state === "day_phase") { 
            phaseInd.innerText = "☀️ แสงอรุณรุ่งสว่าง"; 
            npcText.innerText = "รุ่งอรุณสาดส่อง! คุณสามารถใช้สกิล [เค้นความจริง] เพื่อสงครามจิตวิทยา"; 
            loadTargets(actionArea, "prank", playersData, me.name); 
            processWolfKills(voteArea, playersData); 
        } else if (state === "voting_phase") { 
            phaseInd.innerText = "⚖️ การพิพากษาแห่งสภา"; 
            npcText.innerText = "เวลาแห่งการพิพากษามาถึงแล้ว... จงตัดสินชะตา ใครคือผู้ที่ต้องชดใช้ด้วยชีวิต!"; 
            loadTargets(actionArea, "vote", playersData, me.name); 
        } else if (state === "result_phase") { 
            phaseInd.innerText = "📜 ผลคำพิพากษา"; 
            npcText.innerText = "สภาได้ตัดสินเจตจำนงแล้ว..."; 
            calculateVotesAndTrust(voteArea, playersData); 
        } else if (state === "wolf_win") { 
            phaseInd.innerText = "🩸 อวสานแห่งแสงสว่าง"; 
            roleEl.innerHTML = "WOLVES WIN!"; 
            roleEl.className = "glow-text-wolf"; 
            npcText.innerText = "เสียงหอนกึกก้อง... หมู่บ้านถูกย้อมด้วยสีเลือด หมาป่าคือผู้ชนะอย่างแท้จริง!"; 
            mainCont.classList.add("epic-win-wolf"); 
            winWolfAudio.play(); 
        } else if (state === "villager_win") { 
            phaseInd.innerText = "✨ ชัยชนะแห่งแสงสว่าง"; 
            roleEl.innerHTML = "VILLAGERS WIN!"; 
            roleEl.className = "glow-text-villager"; 
            npcText.innerText = "แสงสว่างขับไล่ความมืดมิด! หมาป่าถูกกำจัดหมดสิ้น หมู่บ้านกลับมาสงบสุขอีกครั้ง!"; 
            mainCont.classList.add("epic-win-villager"); 
            winVillagerAudio.play(); 
        }
    });
});

function loadTargets(container, mode, playersObj, myName) {
    Object.keys(playersObj).forEach(pId => {
        if (pId !== myPlayerId && playersObj[pId].isAlive) {
            const btn = document.createElement("button"); 
            btn.className = mode === "prank" ? "target-btn btn-prank" : "target-btn";
            btn.innerText = mode === "kill" ? "🎯 ล่าเหยื่อ: " + playersObj[pId].name : mode === "seer" ? "🔮 ส่องความจริง: " + playersObj[pId].name : mode === "prank" ? "👉 เค้นความจริง: " + playersObj[pId].name : "⚖️ โหวตประหาร: " + playersObj[pId].name;
            
            btn.onclick = () => {
                playSound('click');
                if (mode === "seer") {
                    showToast(`ความจริง: <b>${playersObj[pId].name}</b> คือ [${playersObj[pId].role === 'wolf' ? 'หมาป่า 🐺' : 'ฝ่ายดี ✨'}]`, "mystic");
                } else if (mode === "prank") { 
                    db.ref("werewolf_game/pranks/" + pId).set(myName); 
                    showToast(`ส่งคำท้าทายเค้นความจริงไปหา <b>${playersObj[pId].name}</b> แล้ว!`, "warning"); 
                } else if (mode === "kill") { 
                    db.ref("werewolf_game/wolf_kills/" + pId).set(true); 
                    showToast(`หมายหัวสังหาร <b>${playersObj[pId].name}</b> เรียบร้อย!`, "error"); 
                } else if (mode === "vote") { 
                    db.ref("werewolf_game/votes/" + myPlayerId).set(pId); 
                    showToast(`ส่งผลโหวตประหาร <b>${playersObj[pId].name}</b> ให้สภาแล้ว!`, "normal"); 
                }
            }; 
            container.appendChild(btn);
        }
    });
}

function processWolfKills(container, playersObj) {
    db.ref("werewolf_game/wolf_kills").once("value", (snap) => {
        if (snap.exists()) { 
            let deadList = []; 
            snap.forEach(child => { 
                let id = child.key; 
                deadList.push(playersObj[id].name); 
                db.ref("werewolf_game/players/" + id + "/isAlive").set(false); 
            }); 
            container.innerHTML = `<div class='vote-result-box' style='border-color:#ff4757;'>รุ่งเช้านี้... มีผู้เสียชีวิตถูกพบในเงามืด: <b>${deadList.join(", ")}</b></div>`; 
        } else { 
            container.innerHTML = `<div class='vote-result-box' style='border-color:#2ed573; color:#2ed573;'>รุ่งเช้านี้... ไม่มีใครเสียชีวิต หมู่บ้านปลอดภัย!</div>`; 
        }
    });
}

function calculateVotesAndTrust(container, playersObj) {
    db.ref("werewolf_game/votes").once("value", (snap) => {
        const votes = snap.val();
        if (!votes) { 
            container.innerHTML = "<div class='vote-result-box' style='border-color:#2ed573; color:#2ed573;'>ไม่มีผู้ใดถูกโหวตในสภา... ทุกคนปลอดภัย!</div>"; 
            if (wasInterrogated && myRole !== 'wolf') { 
                myTrust = (myTrust || 0) + 5; 
                db.ref("werewolf_game/players/" + myPlayerId + "/trust").set(myTrust); 
                showToast("✨ คุณรอดพ้นข้อครหา ความน่าเชื่อถือ +5%", "mystic"); 
                wasInterrogated = false; 
            } 
            return; 
        }
        
        let tally = {}; 
        Object.values(votes).forEach(tId => { tally[tId] = (tally[tId] || 0) + 1; });
        
        let maxVotes = 0; 
        let votedOutId = null; 
        for (const [id, count] of Object.entries(tally)) { 
            if (count > maxVotes) { 
                maxVotes = count; 
                votedOutId = id; 
            } 
        }
        
        if (votedOutId && playersObj[votedOutId]) {
            const p = playersObj[votedOutId]; 
            container.innerHTML = `<div class='vote-result-box'>มติสภา (${maxVotes} เสียง) ขับไล่... <div class='vote-winner'>${p.name}</div><hr style='border:1px solid rgba(255,255,255,0.1); margin:10px 0;'>ความจริงปรากฏ: <b>${p.name} คือ ${p.role === 'wolf' ? '<span style="color:#ff4757">หมาป่า! 🐺</span>' : '<span style="color:#2ed573">ผู้บริสุทธิ์... 🧑</span>'}</b></div>`;
            db.ref("werewolf_game/players/" + votedOutId + "/isAlive").set(false);
            
            if (votedOutId === myPlayerId) { 
                wasInterrogated = false; 
            } else if (wasInterrogated && myRole !== 'wolf') { 
                myTrust = (myTrust || 0) + 5; 
                db.ref("werewolf_game/players/" + myPlayerId + "/trust").set(myTrust); 
                showToast("✨ คุณรอดพ้นข้อครหา ความน่าเชื่อถือ +5%", "mystic"); 
                wasInterrogated = false; 
            }
        }
    });
}

function toggleGMPanel() {
    playSound('click'); 
    const panel = document.getElementById('gm-panel');
    panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
}

let isGmProcessing = false; 

async function gmStartGame() {
    if (isGmProcessing) return; 
    isGmProcessing = true; 
    playSound('click');
    
    try {
        await db.ref("werewolf_game/actions").remove(); 
        await db.ref("werewolf_game/votes").remove();
        await db.ref("werewolf_game/wolf_kills").remove(); 
        await db.ref("werewolf_game/pranks").remove();
        
        const snap = await db.ref("werewolf_game/players").once("value"); 
        const players = snap.val();
        if (!players) { 
            showToast("ยังไม่มีผู้เล่นในห้อง!", "error"); 
            isGmProcessing = false; 
            return; 
        }
        
        let pKeys = Object.keys(players);
        for (let i = pKeys.length - 1; i > 0; i--) { 
            const j = Math.floor(Math.random() * (i + 1)); 
            [pKeys[i], pKeys[j]] = [pKeys[j], pKeys[i]]; 
        }
        
        let updates = {};
        pKeys.forEach((key, idx) => {
            let role = "villager"; 
            if (idx === 0) role = "wolf"; 
            else if (idx === 1 && pKeys.length >= 3) role = "seer";
            
            updates[`werewolf_game/players/${key}/role`] = role;
            updates[`werewolf_game/players/${key}/isAlive`] = true;
            updates[`werewolf_game/players/${key}/trust`] = 0;
        });
        
        await db.ref().update(updates);
        await db.ref("werewolf_game/system/gameState").set("role_reveal");
        showToast("แจกบทบาทเรียบร้อย เกมเริ่มต้น!", "normal");
    } catch(e) { 
        console.error(e); 
    }
    setTimeout(() => { isGmProcessing = false; }, 1000);
}

async function gmNextPhase() {
    if (isGmProcessing) return; 
    isGmProcessing = true; 
    playSound('click');
    
    try {
        const snap = await db.ref("werewolf_game/system/gameState").once("value"); 
        let current = snap.val() || "lobby"; 
        let next = "lobby";
        
        if (current === "lobby") next = "role_reveal";
        else if (current === "role_reveal") { await cleanUpNight(); next = "night_phase"; }
        else if (current === "night_phase") next = "day_phase";
        else if (current === "day_phase") next = "voting_phase";
        else if (current === "voting_phase") next = "result_phase";
        else if (current === "result_phase") { next = await checkWinCondition(); }
        else if (current === "wolf_win" || current === "villager_win") { 
            gmResetGame(); 
            isGmProcessing = false; 
            return; 
        }
        else { await cleanUpNight(); next = "night_phase"; }
        
        await db.ref("werewolf_game/system/gameState").set(next); 
        showToast(`เลื่อนเป็นเฟส: ${next}`, "warning");
    } catch(e) { 
        console.error(e); 
    }
    setTimeout(() => { isGmProcessing = false; }, 1000);
}

async function cleanUpNight() {
    await db.ref("werewolf_game/votes").remove(); 
    await db.ref("werewolf_game/wolf_kills").remove(); 
    await db.ref("werewolf_game/pranks").remove();
}

async function checkWinCondition() {
    const snap = await db.ref("werewolf_game/players").once("value"); 
    const players = snap.val() || {};
    let w = 0, v = 0;
    
    for (let key in players) { 
        if (players[key].isAlive) { 
            if (players[key].role === 'wolf') w++; 
            else v++; 
        } 
    }
    
    if (w === 0 && v > 0) return "villager_win"; 
    if (w >= v && w > 0) return "wolf_win";
    await cleanUpNight(); 
    return "night_phase"; 
}

async function gmResetGame() {
    if (!confirm("คุณต้องการล้างกระดานและเตะทุกคนกลับ Lobby ใช่หรือไม่?")) return;
    playSound('alert');
    await db.ref("werewolf_game"
