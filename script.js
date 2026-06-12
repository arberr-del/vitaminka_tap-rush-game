import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAA1nCWVSXKhDKD0a2DArZyLMmFWwfwQ6o",
  authDomain: "vitaminka-game.firebaseapp.com",
  projectId: "vitaminka-game",
  storageBucket: "vitaminka-game.firebasestorage.app",
  messagingSenderId: "727784838640",
  appId: "1:727784838640:web:c6432548a6d3577c94f935",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const fb = { collection, addDoc, query, orderBy, limit, getDocs };

// --- Global Constants ---
const GAME_DURATION = 65;
const LOCAL_STORAGE_KEY = "vitaminka-Tap-Rush_bestScore";
const BASE_SPAWN_INTERVAL = 900;
const MIN_SPAWN_INTERVAL = 400;
const SNACK_LIFESPAN = 1600;

const GAME_ASSETS = {
  GOOD: [
    "assets/Stobi_Flips.png",
    "assets/Fruti_Visna.png",
    "assets/Bonitas_vkus-na-piperka.png",
  ],
  BAD: "assets/Empty_wrapper.png",
};

// --- DOM References ---
const ELEMENTS = {
  landingScreen: document.getElementById("landing-screen"),
  gameScreen: document.getElementById("game-screen"),
  gameOverScreen: document.getElementById("game-over-screen"),
  registrationForm: document.getElementById("registration-form"),
  bestScoreValue: document.getElementById("best-score-value"),
  nameInput: document.getElementById("name"),
  emailInput: document.getElementById("email"),
  ageInput: document.getElementById("age"),
  scoreDisplay: document.getElementById("score-display"),
  timerDisplay: document.getElementById("timer-display"),
  gameBoard: document.getElementById("game-board"),
  finalScore: document.getElementById("final-score"),
  highScoreMessage: document.getElementById("high-score-message"),
  restartBtn: document.getElementById("restart-btn"),
  mainMenuBtn: document.getElementById("main-menu-btn"),
  comboDisplay: document.getElementById("combo-display"),
};

// --- Game State ---
const GameState = (() => {
  let score = 0;
  let timeRemaining = GAME_DURATION;
  let playerName = "";
  let timerInterval = null;
  let spawnTimeout = null;
  let activeSnacks = new Map();
  let combo = 0;
  let isShielded = false;

  return {
    getScore: () => score,
    setScore: (v) => {
      score = Math.max(0, v);
      ELEMENTS.scoreDisplay.textContent = `Score: ${score}`;
    },
    getTime: () => timeRemaining,
    setTime: (v) => {
      timeRemaining = v;
      ELEMENTS.timerDisplay.textContent = `Time: ${timeRemaining}s`;
    },
    getName: () => playerName,
    setName: (n) => (playerName = n),
    getTimerInterval: () => timerInterval,
    setTimerInterval: (v) => (timerInterval = v),
    getSpawnTimeout: () => spawnTimeout,
    setSpawnTimeout: (v) => (spawnTimeout = v),
    getActiveSnacks: () => activeSnacks,
    getCombo: () => combo,
    setCombo: (v) => {
      combo = v;
      ELEMENTS.comboDisplay.textContent = `Combo: x${combo}`;
    },
    increaseCombo: () => {
      combo++;
    },
    decayCombo: () => {
      combo = Math.floor(combo * 0.6);
      ELEMENTS.comboDisplay.textContent = `Combo: ${combo}`;
      ELEMENTS.comboDisplay.classList.remove("combo-fire");
    },
    resetCombo: () => {
      combo = 0;
      ELEMENTS.comboDisplay.textContent = `Combo: 0`;
      ELEMENTS.comboDisplay.classList.remove("combo-fire");
    },
    getShield: () => isShielded,
    setShield: (v) => {
      isShielded = v;
    },
    reset: (name) => {
      score = 0;
      timeRemaining = GAME_DURATION;
      playerName = name;
      timerInterval = null;
      spawnTimeout = null;
      combo = 0;
      isShielded = false;
      activeSnacks.clear();
      ELEMENTS.comboDisplay.textContent = "Combo: 0";
      ELEMENTS.comboDisplay.classList.remove("combo-fire");
    },
  };
})();

// --- Helper: LocalStorage ---
function loadBestScore() {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data
      ? JSON.parse(data)
      : { name: "N/A", email: "N/A", age: "N/A", score: 0 };
  } catch (e) {
    return { name: "N/A", email: "N/A", age: "N/A", score: 0 };
  }
}

function saveBestScore(score) {
  // 1. Get the current user info we saved during registration
  const userRaw = localStorage.getItem("vitaminka_currentUser");
  const user = userRaw
    ? JSON.parse(userRaw)
    : { name: "Unknown", email: "N/A", age: "N/A" };

  const currentBest = loadBestScore();

  // 2. Only save if the new score is higher
  if (score > currentBest.score) {
    const newBest = {
      score: score,
      name: user.name,
      email: user.email,
      age: user.age,
      date: new Date().toLocaleDateString(),
    };

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newBest));
    return true;
  }
  return false;
}

// --- Visual Effects ---
function createParticles(x, y, color) {
  for (let i = 0; i < 8; i++) {
    const p = document.createElement("div");
    p.classList.add("particle");
    p.style.backgroundColor = color;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;

    const destX = (Math.random() - 0.5) * 150;
    const destY = (Math.random() - 0.5) * 150;

    p.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${destX}px, ${destY}px) scale(0)`, opacity: 0 },
      ],
      { duration: 600, easing: "ease-out" },
    ).onfinish = () => p.remove();

    ELEMENTS.gameBoard.appendChild(p);
  }
}

function showFloatingText(x, y, text, type) {
  const el = document.createElement("div");
  el.textContent = text;
  el.className = `floating-text ${type}`;

  const boardRect = ELEMENTS.gameBoard.getBoundingClientRect();
  el.style.left = `${x - boardRect.left}px`;
  el.style.top = `${y - boardRect.top}px`;

  ELEMENTS.gameBoard.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

// --- Game Logic ---

function createSnack() {
  const roll = Math.random();
  let type = "good";
  if (roll < 0.15) type = "bad";
  if (roll > 0.95) type = "golden";

  const element = document.createElement("div");
  element.classList.add("snack-element", type);

  if (type === "bad") {
    element.style.backgroundImage = `url('${GAME_ASSETS.BAD}')`;
  } else {
    const img =
      GAME_ASSETS.GOOD[Math.floor(Math.random() * GAME_ASSETS.GOOD.length)];
    element.style.backgroundImage = `url('${img}')`;
  }

  const maxX = ELEMENTS.gameBoard.clientWidth - 70;
  const maxY = ELEMENTS.gameBoard.clientHeight - 70;
  element.style.left = `${Math.random() * maxX}px`;
  element.style.top = `${Math.random() * maxY}px`;

  ELEMENTS.gameBoard.appendChild(element);
  return { element, type };
}

function scheduleNextSpawn() {
  if (GameState.getTime() <= 0) return;

  const currentScore = GameState.getScore();

  const speedFactor = Math.min(500, currentScore * 0.5);

  const nextInterval = Math.max(
    MIN_SPAWN_INTERVAL,
    BASE_SPAWN_INTERVAL - speedFactor,
  );

  const timeout = setTimeout(() => {
    spawnOneSnack(nextInterval);
    scheduleNextSpawn();
  }, nextInterval);

  GameState.setSpawnTimeout(timeout);
}

function spawnOneSnack(currentInterval) {
  const { element, type } = createSnack();
  const activeSnacks = GameState.getActiveSnacks();

  let lifespan = currentInterval * 1.8;

  if (type === "golden") lifespan = currentInterval * 1.2;

  const timeout = setTimeout(() => {
    if (activeSnacks.has(element)) {
      element.remove();
      activeSnacks.delete(element);

      if (type === "good") {
        GameState.decayCombo();
      }
    }
  }, lifespan);

  activeSnacks.set(element, { type, timeout });
}

function activateFeverMode() {
  const board = ELEMENTS.gameBoard;

  board.classList.add("fever-active");

  showFloatingText(
    window.innerWidth / 2,
    window.innerHeight / 2,
    "🔥 FEVER MODE! 🔥",
    "score-gold",
  );

  setTimeout(() => {
    board.classList.remove("fever-active");
  }, 5000);
}

function handleInput(event) {
  if (event.type === "touchstart") event.preventDefault();

  const target = event.target.closest(".snack-element");
  if (!target) return;

  const activeSnacks = GameState.getActiveSnacks();
  const data = activeSnacks.get(target);
  if (!data) return;

  clearTimeout(data.timeout);
  activeSnacks.delete(target);
  target.remove();

  const x = event.clientX || (event.touches ? event.touches[0].clientX : 0);
  const y = event.clientY || (event.touches ? event.touches[0].clientY : 0);

  if (data.type === "bad") {
    // PROTECTED: Shield prevents combo loss if you just hit a good snack
    if (!GameState.getShield()) {
      GameState.decayCombo();
      GameState.setScore(GameState.getScore() - 20);
      showFloatingText(x, y, "-20", "score-minus");
    } else {
      showFloatingText(x, y, "SHIELDED", "score-plus");
    }

    createParticles(
      x - ELEMENTS.gameBoard.getBoundingClientRect().left,
      y - ELEMENTS.gameBoard.getBoundingClientRect().top,
      "var(--color-error)",
    );
    ELEMENTS.gameBoard.style.transform = "translateX(5px)";
    setTimeout(
      () => (ELEMENTS.gameBoard.style.transform = "translateX(0)"),
      100,
    );
  } else {
    // REWARD LOGIC
    GameState.increaseCombo();
    const combo = GameState.getCombo();

    if (combo === 15) {
      activateFeverMode();
    }

    // 1.5s Shield after a good hit
    GameState.setShield(true);
    setTimeout(() => GameState.setShield(false), 1500);

    // EXPONENTIAL MULTIPLIERS
    let multiplier = 1;
    if (combo >= 30) multiplier = 15;
    else if (combo >= 20) multiplier = 10;
    else if (combo >= 10) multiplier = 5;
    else if (combo >= 5) multiplier = 2;

    let points = (data.type === "golden" ? 100 : 10) * multiplier;
    GameState.setScore(GameState.getScore() + points);

    ELEMENTS.comboDisplay.textContent = `Combo: ${combo} (${multiplier}x Points!)`;
    if (combo >= 10) ELEMENTS.comboDisplay.classList.add("combo-fire");

    const color =
      data.type === "golden" ? "var(--color-gold)" : "var(--color-success)";
    const textClass = data.type === "golden" ? "score-gold" : "score-plus";
    showFloatingText(x, y, `+${points}`, textClass);

    const boardRect = ELEMENTS.gameBoard.getBoundingClientRect();
    createParticles(x - boardRect.left, y - boardRect.top, color);
  }
}

function startGame(name) {
  GameState.reset(name);
  ELEMENTS.gameBoard.innerHTML = "";
  ELEMENTS.gameBoard.addEventListener("pointerdown", handleInput);

  const timerInt = setInterval(() => {
    const t = GameState.getTime();
    if (t <= 0) {
      clearInterval(timerInt);
      endGame();
    } else {
      GameState.setTime(t - 1);

      // Update Timer Bar
      const bar = document.getElementById("timer-bar");
      if (bar) {
        const percentage = (GameState.getTime() / GAME_DURATION) * 100;
        bar.style.width = percentage + "%";
        if (percentage < 25) bar.style.backgroundColor = "var(--color-error)";
      }
    }
  }, 1000);
  GameState.setTimerInterval(timerInt);
  scheduleNextSpawn();
}

async function endGame() {
  clearInterval(GameState.getTimerInterval());
  clearTimeout(GameState.getSpawnTimeout());
  ELEMENTS.gameBoard.removeEventListener("pointerdown", handleInput);

  GameState.getActiveSnacks().forEach((v, k) => {
    clearTimeout(v.timeout);
    k.remove();
  });
  GameState.getActiveSnacks().clear();

  const score = GameState.getScore();
  const name = GameState.getName();
  
  // 1. Check Local Best (on this laptop)
  const isNewLocalBest = saveBestScore(score);
  const currentLocalBest = loadBestScore();

  // 2. Save to Firebase and Check Global Status
  let isGlobalTop5 = false;
  try {
    // Save current score
    await fb.addDoc(fb.collection(db, "leaderboard"), {
      name: name,
      score: score,
      timestamp: new Date(),
    });

    // Fetch Top 5 to see if you are in it
    const q = fb.query(fb.collection(db, "leaderboard"), fb.orderBy("score", "desc"), fb.limit(5));
    const querySnapshot = await fb.getDocs(q);
    
    querySnapshot.forEach((doc) => {
      if (doc.data().score === score && doc.data().name === name) {
        isGlobalTop5 = true;
      }
    });
  } catch (e) {
    console.error("Cloud error:", e);
  }

  // 3. Display the right message
  ELEMENTS.finalScore.textContent = score;
  
  if (isGlobalTop5) {
    ELEMENTS.highScoreMessage.textContent = "🌍 UNBELIEVABLE! You made it to the WORLD TOP 5!";
    ELEMENTS.highScoreMessage.style.color = "var(--color-gold)";
  } else if (isNewLocalBest) {
    ELEMENTS.highScoreMessage.textContent = "⭐ NEW PERSONAL BEST! You beat your own record!";
    ELEMENTS.highScoreMessage.style.color = "var(--color-success)";
  } else {
    ELEMENTS.highScoreMessage.textContent = `Your Personal Best: ${currentLocalBest.score}`;
    ELEMENTS.highScoreMessage.style.color = "inherit";
  }

  ELEMENTS.gameScreen.classList.add("hidden-screen");
  ELEMENTS.gameOverScreen.classList.remove("hidden-screen");
}

document.addEventListener("DOMContentLoaded", () => {
  const best = loadBestScore();
  const bestDisplay = document.getElementById("best-score-value");
  if (bestDisplay) {
    bestDisplay.textContent = `${best.score} (${best.name})`;
  }

  fetchGlobalLeaderboard();

  ELEMENTS.registrationForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = ELEMENTS.nameInput.value;
    const email = ELEMENTS.emailInput.value;
    const age = ELEMENTS.ageInput.value;

    if (name.length > 1) {
      const userInfo = { name, email, age };
      localStorage.setItem("vitaminka_currentUser", JSON.stringify(userInfo));

      ELEMENTS.landingScreen.classList.add("hidden-screen");
      ELEMENTS.gameScreen.classList.remove("hidden-screen");
      startGame(name);
    }
  });

  async function fetchGlobalLeaderboard() {
    try {
      const q = fb.query(
        fb.collection(db, "leaderboard"),
        fb.orderBy("score", "desc"),
        fb.limit(5),
      );
      const querySnapshot = await fb.getDocs(q);

      let listHTML = "<ul>";
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        listHTML += `<li>${data.name}: <b>${data.score}</b></li>`;
      });
      listHTML += "</ul>";

      const display = document.getElementById("global-list");
      if (display) display.innerHTML = listHTML;
    } catch (e) {
      console.error("Leaderboard error:", e);
    }
  }

  ELEMENTS.restartBtn.addEventListener("click", () => {
    ELEMENTS.gameOverScreen.classList.add("hidden-screen");
    ELEMENTS.gameScreen.classList.remove("hidden-screen");
    startGame(GameState.getName());
  });

  ELEMENTS.mainMenuBtn.addEventListener("click", () => {
    location.reload();
  });
});
