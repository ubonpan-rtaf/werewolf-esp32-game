// 1. นำ Config ของ Firebase มาใส่
const firebaseConfig = {
    apiKey: "AIzaSyCwgLaNKEBORncza75PO4IrGxTrF8vKoQw",
    authDomain: "werewolf-esp32-game.firebaseapp.com",
    projectId: "werewolf-esp32-game",
    storageBucket: "werewolf-esp32-game.firebasestorage.app",
    messagingSenderId: "768089473466",
    appId: "1:768089473466:web:b9196bc05fa83144c39d83",
    databaseURL: "https://werewolf-esp32-game-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// 2. เริ่มต้นเชื่อมต่อ Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let myPlayerId = ""; // ตัวแปรเก็บ ID ประจำเครื่องนี้

// 3. ฟังก์ชันสำหรับตอนกดปุ่ม "เข้าร่วมวง"
function joinGame() {
    const nameInput = document.getElementById("player-name").value;
    
    if (nameInput.trim() === "") {
        alert("กรุณาใส่ชื่อของคุณด้วยครับ!");
        return;
    }

    // สร้าง ID ให้ผู้เล่นคนนี้
    myPlayerId = "player_" + Date.now(); 

    console.log("กำลังส่งข้อมูลไป Firebase...");

    // 4. บันทึกข้อมูลลง Firebase
    db.ref("werewolf_game/players/" + myPlayerId).set({
        name: nameInput,
        role: "waiting", // รอ ESP32 เป็นคนแจกบทบาท
        isAlive: true,
        targetThisNight: "",
        voteTarget: ""
    }).then(() => {
        console.log("บันทึกข้อมูลสำเร็จ!");
        
        // ซ่อนหน้า Lobby
        document.getElementById("lobby-screen").style.display = "none";
        
        // โชว์ข้อความรอ
        const statusDiv = document.getElementById("status-message");
        statusDiv.style.display = "block";
        statusDiv.innerText = "ยินดีต้อนรับ " + nameInput + "!\nรอ Game Master (ESP32) เริ่มเกม...";
    }).catch((error) => {
        console.error("มีปัญหาในการบันทึกข้อมูล:", error);
        alert("เกิดข้อผิดพลาด! กรุณาเช็คว่าตั้งค่า Rules ใน Firebase เป็น true หรือยัง");
    });
}

