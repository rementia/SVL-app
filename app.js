import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCgVh9fmwib7ox-I1Q9c5IU-B4909XkhkU",
  authDomain: "svl-app-65204.firebaseapp.com",
  projectId: "svl-app-65204",
  storageBucket: "svl-app-65204.firebasestorage.app",
  messagingSenderId: "512772798709",
  appId: "1:512772798709:web:d28cb5154b15fccae26dbc",
  measurementId: "G-XYZMESKJRM"
};

const sheetUrls = {
  vol1: "https://docs.google.com/spreadsheets/d/1Kih8sWJwP1TgzUfQrHIAN-f0fiHCOrvNU3554A_DMK0/export?format=csv&gid=0",
  vol2: "https://docs.google.com/spreadsheets/d/1Kih8sWJwP1TgzUfQrHIAN-f0fiHCOrvNU3554A_DMK0/export?format=csv&gid=1906065075",
  vol3: "https://docs.google.com/spreadsheets/d/1Kih8sWJwP1TgzUfQrHIAN-f0fiHCOrvNU3554A_DMK0/export?format=csv&gid=769789994",
  vol4: "https://docs.google.com/spreadsheets/d/1Kih8sWJwP1TgzUfQrHIAN-f0fiHCOrvNU3554A_DMK0/export?format=csv&gid=297106222"
};

const volOrder = ["vol1", "vol2", "vol3", "vol4"];
const challengeTimes = [1000, 1500, 3000];

const STORAGE_KEYS = {
  vol: "tango_current_vol",
  indexByVol: "tango_index_by_vol",
  sidebarOpen: "tango_sidebar_open",
  autoSpeak: "tango_auto_speak",
  favorites: "tango_favorites",
  favoritesUpdatedAt: "tango_favorites_updated_at",
  challengeMode: "tango_challenge_mode",
  challengeTime: "tango_challenge_time",
  randomMode: "tango_random_mode"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

const listEl = document.getElementById("list");
const sidebarEl = document.getElementById("sidebar");
const wordEl = document.getElementById("word");
const meaningEl = document.getElementById("meaning");
const pronunciationEl = document.getElementById("pronunciation");
const prevHintEl = document.getElementById("prevHint");
const nextHintEl = document.getElementById("nextHint");
const currentEl = document.getElementById("current");
const statusLineEl = document.getElementById("statusLine");

const favoriteToggleBtnEl = document.getElementById("favoriteToggleBtn");
const favoriteListBtnEl = document.getElementById("favoriteListBtn");
const autoSpeakBtnEl = document.getElementById("autoSpeakBtn");
const challengeBtnEl = document.getElementById("challengeBtn");
const randomBtnEl = document.getElementById("randomBtn");
const loginBtnEl = document.getElementById("loginBtn");
const logoutBtnEl = document.getElementById("logoutBtn");
const toggleSidebarBtnEl = document.getElementById("toggleSidebarBtn");
const prevWordBtnEl = document.getElementById("prevWordBtn");
const nextWordBtnEl = document.getElementById("nextWordBtn");
const speakWordBtnEl = document.getElementById("speakWordBtn");
const volButtons = Array.from(document.querySelectorAll(".vol-btn"));

let currentUser = null;
let favoritesUnsubscribe = null;

let allWordsByVol = {
  vol1: [],
  vol2: [],
  vol3: [],
  vol4: []
};

let words = [];
let index = 0;
let currentVol = "vol1";
let currentMode = "vol";
let sidebarOpen = true;
let autoSpeak = false;
let favorites = {};
let favoritesUpdatedAt = 0;
let challengeMode = false;
let challengeTime = 1500;
let randomMode = false;

let meaningRevealTimer = null;
let autoSpeakTimer = null;
let currentPronunciationController = null;
let lastPronunciationRequest = "";
let hasFinishedInitialLoading = false;

let listNeedsRebuild = true;
let renderedListVersion = "";
let listVersion = 0;
let favoritesVersion = 0;

let indexByVol = {
  vol1: 0,
  vol2: 0,
  vol3: 0,
  vol4: 0,
  favorites: 0
};

let shuffledWordsMap = {};
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
let lastTouchEnd = 0;
let swipeEnabled = false;

/**
 * ランダム中の「戻る」を履歴ベースにするための履歴
 */
let historyBackStack = [];
let historyForwardStack = [];

function init() {
  loadSavedState();
  bindTouchEvents();
  bindUIEvents();
  bindKeyboardEvents();
  setupAuthListener();
  updateSpeechButtonAvailability();
  loadSheet(currentVol);
}

function finishInitialLoading() {
  if (hasFinishedInitialLoading) return;
  hasFinishedInitialLoading = true;
  document.body.classList.remove("loading");
}

function bindUIEvents() {
  loginBtnEl?.addEventListener("click", signInWithGoogle);
  logoutBtnEl?.addEventListener("click", signOutUser);
  toggleSidebarBtnEl?.addEventListener("click", toggleSidebar);
  autoSpeakBtnEl?.addEventListener("click", toggleAutoSpeak);
  challengeBtnEl?.addEventListener("click", toggleChallengeMode);
  randomBtnEl?.addEventListener("click", toggleRandomMode);
  favoriteListBtnEl?.addEventListener("click", loadFavoritesMode);
  favoriteToggleBtnEl?.addEventListener("click", toggleFavoriteCurrentWord);
  prevWordBtnEl?.addEventListener("click", prevWord);
  nextWordBtnEl?.addEventListener("click", nextWord);
  speakWordBtnEl?.addEventListener("click", speakWord);

  challengeBtnEl?.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    cycleChallengeTime();
  });

  volButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const volName = button.dataset.vol;
      if (volName) {
        loadSheet(volName);
      }
    });
  });

  listEl?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest(".word-item") : null;
    if (!(target instanceof HTMLElement)) return;

    const nextIndex = Number(target.dataset.index);
    if (Number.isNaN(nextIndex)) return;

    moveToIndex(nextIndex, { pushHistory: true });
  });
}

function bindKeyboardEvents() {
  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      prevWord();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      nextWord();
      return;
    }

    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      speakWord();
      return;
    }

    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleFavoriteCurrentWord();
      return;
    }

    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      toggleRandomMode();
    }
  });
}

function bindTouchEvents() {
  document.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.changedTouches[0];
      if (!touch) return;

      const startTarget = event.target instanceof Element ? event.target : null;
      swipeEnabled = isSwipeAllowedTarget(startTarget);
      touchStartX = touch.screenX;
      touchStartY = touch.screenY;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchend",
    (event) => {
      const touch = event.changedTouches[0];
      if (!touch) return;

      touchEndX = touch.screenX;
      touchEndY = touch.screenY;

      if (swipeEnabled) {
        handleSwipe();
      }

      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
      swipeEnabled = false;
    },
    { passive: false }
  );
}

function isSwipeAllowedTarget(target) {
  if (!(target instanceof Element)) return true;
  if (target.closest("button, a, input, textarea, select, label")) return false;
  if (target.closest("#sidebar")) return false;
  return true;
}

function loadSavedState() {
  const savedVol = localStorage.getItem(STORAGE_KEYS.vol);
  const savedSidebarOpen = localStorage.getItem(STORAGE_KEYS.sidebarOpen);
  const savedAutoSpeak = localStorage.getItem(STORAGE_KEYS.autoSpeak);
  const savedIndexByVol = localStorage.getItem(STORAGE_KEYS.indexByVol);
  const savedFavorites = localStorage.getItem(STORAGE_KEYS.favorites);
  const savedFavoritesUpdatedAt = localStorage.getItem(STORAGE_KEYS.favoritesUpdatedAt);
  const savedChallengeMode = localStorage.getItem(STORAGE_KEYS.challengeMode);
  const savedChallengeTime = localStorage.getItem(STORAGE_KEYS.challengeTime);
  const savedRandomMode = localStorage.getItem(STORAGE_KEYS.randomMode);

  if (savedVol && sheetUrls[savedVol]) currentVol = savedVol;
  if (savedSidebarOpen !== null) sidebarOpen = savedSidebarOpen === "true";
  if (savedAutoSpeak !== null) autoSpeak = savedAutoSpeak === "true";

  if (savedIndexByVol) {
    try {
      indexByVol = { ...indexByVol, ...JSON.parse(savedIndexByVol) };
    } catch (error) {
      console.warn("indexByVol restore failed", error);
    }
  }

  if (savedFavorites) {
    try {
      const parsedFavorites = JSON.parse(savedFavorites);
      favorites = parsedFavorites && typeof parsedFavorites === "object" ? parsedFavorites : {};
    } catch {
      favorites = {};
    }
  }

  if (savedFavoritesUpdatedAt) {
    favoritesUpdatedAt = Number(savedFavoritesUpdatedAt) || 0;
  }

  if (savedChallengeMode !== null) challengeMode = savedChallengeMode === "true";

  if (savedChallengeTime !== null) {
    const parsedTime = Number(savedChallengeTime);
    if (challengeTimes.includes(parsedTime)) {
      challengeTime = parsedTime;
    }
  }

  if (savedRandomMode !== null) randomMode = savedRandomMode === "true";

  updateAutoSpeakButton();
  updateChallengeButton();
  updateRandomButton();
  applySidebarState();
}

function setupAuthListener() {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    updateAuthUI();

    if (favoritesUnsubscribe) {
      favoritesUnsubscribe();
      favoritesUnsubscribe = null;
    }

    if (!user) return;

    await loadFavoritesFromCloud();
    subscribeFavoritesRealtime();
    requestListRebuild();
    render();
  });
}

function updateAuthUI() {
  if (!loginBtnEl || !logoutBtnEl) return;
  loginBtnEl.style.display = currentUser ? "none" : "inline-block";
  logoutBtnEl.style.display = currentUser ? "inline-block" : "none";
}

async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Googleログイン失敗:", error);
    alert("ログインに失敗しました。");
  }
}

async function signOutUser() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("ログアウト失敗:", error);
    alert("ログアウトに失敗しました。");
  }
}

function subscribeFavoritesRealtime() {
  if (!currentUser) return;

  const ref = doc(db, "users", currentUser.uid);

  favoritesUnsubscribe = onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;

    const data = snap.data();
    const cloudFavorites = data?.favorites && typeof data.favorites === "object" ? data.favorites : {};
    const cloudUpdatedAt = Number(data?.favoritesUpdatedAt) || 0;

    if (cloudUpdatedAt <= favoritesUpdatedAt) return;

    favorites = cloudFavorites;
    favoritesUpdatedAt = cloudUpdatedAt;
    favoritesVersion += 1;

    saveFavoritesToLocalOnly();
    saveFavoritesUpdatedAt();
    clearAllShuffleCache();
    requestListRebuild();

    if (currentMode === "favorites") {
      applyWordOrder(false);
      index = Math.min(index, Math.max(words.length - 1, 0));
    }

    render();
  });
}

function saveCurrentVol() {
  localStorage.setItem(STORAGE_KEYS.vol, currentVol);
}

function saveIndexByVol() {
  localStorage.setItem(STORAGE_KEYS.indexByVol, JSON.stringify(indexByVol));
}

function saveSidebarState() {
  localStorage.setItem(STORAGE_KEYS.sidebarOpen, String(sidebarOpen));
}

function saveAutoSpeakState() {
  localStorage.setItem(STORAGE_KEYS.autoSpeak, String(autoSpeak));
}

function saveFavoritesToLocalOnly() {
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favorites));
}

function saveFavoritesUpdatedAt() {
  localStorage.setItem(STORAGE_KEYS.favoritesUpdatedAt, String(favoritesUpdatedAt));
}

function saveChallengeModeState() {
  localStorage.setItem(STORAGE_KEYS.challengeMode, String(challengeMode));
}

function saveChallengeTimeState() {
  localStorage.setItem(STORAGE_KEYS.challengeTime, String(challengeTime));
}

function saveRandomModeState() {
  localStorage.setItem(STORAGE_KEYS.randomMode, String(randomMode));
}

async function loadFavoritesFromCloud() {
  if (!currentUser) return;

  try {
    const ref = doc(db, "users", currentUser.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      if (Object.keys(favorites).length > 0) {
        favoritesUpdatedAt = Date.now();
        await setDoc(ref, { favorites, favoritesUpdatedAt }, { merge: true });
      }
      return;
    }

    const data = snap.data();
    const cloudFavorites = data?.favorites && typeof data.favorites === "object" ? data.favorites : {};
    const cloudUpdatedAt = Number(data?.favoritesUpdatedAt) || 0;

    if (cloudUpdatedAt >= favoritesUpdatedAt) {
      favorites = cloudFavorites;
      favoritesUpdatedAt = cloudUpdatedAt;
    } else {
      await setDoc(ref, { favorites, favoritesUpdatedAt }, { merge: true });
    }

    favoritesVersion += 1;
    saveFavoritesToLocalOnly();
    saveFavoritesUpdatedAt();
  } catch (error) {
    console.error("クラウド読み込み失敗:", error);
  }
}

async function saveFavoritesToCloud() {
  if (!currentUser) return;

  try {
    const ref = doc(db, "users", currentUser.uid);
    await setDoc(ref, { favorites, favoritesUpdatedAt }, { merge: true });
  } catch (error) {
    console.error("クラウド保存失敗:", error);
  }
}

async function fetchWithRetry(url, retryCount = 1) {
  let lastError = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function fetchWordsForVol(volName) {
  const response = await fetchWithRetry(sheetUrls[volName], 1);
  const text = await response.text();
  return parseCsvToWords(text, volName);
}

async function ensureVolLoaded(volName) {
  if (!allWordsByVol[volName] || allWordsByVol[volName].length === 0) {
    allWordsByVol[volName] = await fetchWordsForVol(volName);
  }
}

async function ensureAllVolumesLoaded() {
  for (const vol of volOrder) {
    await ensureVolLoaded(vol);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function parseCsvToWords(text, volName) {
  const rows = parseCsv(text)
    .map((cols) => cols.map((col) => String(col ?? "").trim()))
    .filter((cols) => cols.some((col) => col !== ""));

  let startIndex = 0;
  if (rows.length > 0) {
    const firstCell = (rows[0][0] || "").toLowerCase();
    const secondCell = (rows[0][1] || "").toLowerCase();
    if (
      firstCell === "word" ||
      firstCell === "単語" ||
      secondCell === "meaning" ||
      secondCell === "意味"
    ) {
      startIndex = 1;
    }
  }

  return rows.slice(startIndex)
    .map((cols, rowIndex) => {
      const word = cols[0] || "";
      const meaning = cols.slice(1).join(",").replace(/,+$/, "").trim();
      const id = `${volName}-${rowIndex + startIndex}-${normalizeWord(word)}`;
      return {
        id,
        word,
        meaning,
        sourceVol: volName
      };
    })
    .filter((item) => item.word);
}

async function loadSheet(volName) {
  try {
    currentMode = "vol";
    currentVol = volName;
    clearNavigationHistory();
    saveCurrentVol();

    await ensureVolLoaded(volName);
    applyWordOrder(false);

    index = Math.min(indexByVol[volName] || 0, Math.max(words.length - 1, 0));

    requestListRebuild();
    render();
    finishInitialLoading();

    preloadOtherVolumesInBackground();
  } catch (error) {
    console.error(error);
    finishInitialLoading();
    alert("読み込みに失敗しました。スプレッドシートの共有設定をご確認ください。");
  }
}

async function preloadOtherVolumesInBackground() {
  const otherVols = volOrder.filter((vol) => vol !== currentVol);
  for (const vol of otherVols) {
    ensureVolLoaded(vol).catch(() => {});
  }
}

function normalizeWord(word) {
  return String(word).toLowerCase().trim();
}

function makeFavoriteKey(item) {
  return item.id;
}

function isFavorite(item) {
  return !!favorites[makeFavoriteKey(item)];
}

function buildFavoriteEntries() {
  const entries = [];
  volOrder.forEach((vol) => {
    (allWordsByVol[vol] || []).forEach((item) => {
      if (isFavorite(item)) {
        entries.push(item);
      }
    });
  });
  return entries;
}

function makeShuffleKey() {
  return currentMode === "favorites" ? "favorites:all" : `vol:${currentVol}`;
}

function shuffleArray(array) {
  const copied = [...array];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

function applyWordOrder(resetIndex = false) {
  const baseWords = currentMode === "favorites"
    ? buildFavoriteEntries()
    : [...(allWordsByVol[currentVol] || [])];

  if (randomMode) {
    const shuffleKey = makeShuffleKey();
    const currentCache = shuffledWordsMap[shuffleKey];

    const cacheValid =
      Array.isArray(currentCache) &&
      currentCache.length === baseWords.length &&
      currentCache.every((item, i) => item.id === currentCache[i].id);

    if (!cacheValid) {
      shuffledWordsMap[shuffleKey] = shuffleArray(baseWords);
    }

    words = shuffledWordsMap[shuffleKey];
  } else {
    words = baseWords;
  }

  index = resetIndex ? 0 : Math.min(index, Math.max(words.length - 1, 0));
}

function clearAllShuffleCache() {
  shuffledWordsMap = {};
}

function clearNavigationHistory() {
  historyBackStack = [];
  historyForwardStack = [];
}

function moveToIndex(nextIndex, { pushHistory = false } = {}) {
  if (!words.length) return;
  if (nextIndex < 0 || nextIndex >= words.length) return;
  if (nextIndex === index) return;

  if (pushHistory) {
    historyBackStack.push(index);
    historyForwardStack = [];
  }

  index = nextIndex;
  renderCurrentWord();
}

function getRandomPrevIndexFromHistory() {
  if (!historyBackStack.length) return null;
  const prev = historyBackStack.pop();
  historyForwardStack.push(index);
  return prev;
}

function getRandomNextIndexFromHistory() {
  if (!historyForwardStack.length) return null;
  const next = historyForwardStack.pop();
  historyBackStack.push(index);
  return next;
}

function requestListRebuild() {
  listNeedsRebuild = true;
  listVersion += 1;
}

function getListRenderVersion() {
  return `${currentMode}|${currentVol}|${randomMode ? 1 : 0}|${listVersion}|${favoritesVersion}`;
}

function render() {
  renderList();
  renderCurrentWord();
  updateCurrentLabel();
  updateTopButtons();
  updateRandomButton();
  applySidebarState();
}

function renderList() {
  if (!listEl) return;

  const nextVersion = getListRenderVersion();
  if (!listNeedsRebuild && renderedListVersion === nextVersion) {
    highlightActiveWord();
    return;
  }

  listEl.innerHTML = "";
  const fragment = document.createDocumentFragment();

  words.forEach((item, itemIndex) => {
    const row = document.createElement("div");
    row.className = "word-item";
    row.dataset.index = String(itemIndex);

    const label = document.createElement("span");
    label.className = "word-label";
    label.textContent = currentMode === "favorites"
      ? `${item.word} (${item.sourceVol.replace("vol", "vol.")})`
      : item.word;
    row.appendChild(label);

    if (isFavorite(item)) {
      const star = document.createElement("span");
      star.className = "item-star";
      star.textContent = "★";
      row.appendChild(star);
    }

    fragment.appendChild(row);
  });

  listEl.appendChild(fragment);
  listNeedsRebuild = false;
  renderedListVersion = nextVersion;
  highlightActiveWord();
}

function renderCurrentWord() {
  clearMeaningRevealTimer();
  clearAutoSpeakTimer();

  const current = getCurrentWord();
  if (!current) {
    if (wordEl) wordEl.textContent = currentMode === "favorites" ? "お気に入りがありません" : "単語がありません";
    if (meaningEl) meaningEl.textContent = currentMode === "favorites" ? "☆を付けるとここに表示されます" : "";
    if (pronunciationEl) pronunciationEl.textContent = "";
    if (prevHintEl) prevHintEl.textContent = "";
    if (nextHintEl) nextHintEl.textContent = "";
    if (statusLineEl) statusLineEl.textContent = "";
    updateFavoriteToggleButton();
    return;
  }

  renderWordText(current);
  updateMeaningDisplay(current.meaning);
  updateCurrentStateMeta();
  loadPronunciation(current.word);
  scheduleAutoSpeak();
}

function renderWordText(current) {
  if (wordEl) wordEl.textContent = current.word;
}

function updateCurrentStateMeta() {
  persistCurrentIndex();
  const activeItem = highlightActiveWord();
  scrollActiveWordIntoView(activeItem);
  updateNavHints();
  updateFavoriteToggleButton();
  updateStatusLine();
}

function persistCurrentIndex() {
  if (currentMode === "vol") {
    indexByVol[currentVol] = index;
  } else {
    indexByVol.favorites = index;
  }
  saveIndexByVol();
}

function updateCurrentLabel() {
  if (!currentEl) return;

  let label = currentMode === "favorites"
    ? "☆一覧"
    : `vol.${currentVol.replace("vol", "")}`;

  if (randomMode) {
    label += " / ランダム";
  }

  currentEl.textContent = label;
}

function updateTopButtons() {
  volButtons.forEach((button) => {
    const isActive = currentMode === "vol" && button.dataset.vol === currentVol;
    button.classList.toggle("active-vol", isActive);
  });

  if (favoriteListBtnEl) {
    favoriteListBtnEl.classList.toggle("active-vol", currentMode === "favorites");
  }
}

function updateToggleButton(button, label, isActive) {
  if (!button) return;
  button.textContent = label;
  button.classList.toggle("active", isActive);
  button.classList.toggle("active-blue", isActive);
}

function updateFavoriteToggleButton() {
  const current = getCurrentWord();
  if (!favoriteToggleBtnEl || !current) return;

  const active = isFavorite(current);
  favoriteToggleBtnEl.textContent = active ? "★" : "☆";
  favoriteToggleBtnEl.classList.toggle("active", active);
  favoriteToggleBtnEl.title = active ? "★解除" : "★登録";
  favoriteToggleBtnEl.setAttribute("aria-label", active ? "お気に入り解除" : "お気に入り登録");
}

function updateNavHints() {
  if (!prevHintEl || !nextHintEl) return;
  if (!words.length) {
    prevHintEl.textContent = "";
    nextHintEl.textContent = "";
    return;
  }

  const prevIndex = randomMode && historyBackStack.length
    ? historyBackStack[historyBackStack.length - 1]
    : (index - 1 + words.length) % words.length;

  const nextIndex = randomMode && historyForwardStack.length
    ? historyForwardStack[historyForwardStack.length - 1]
    : (index + 1) % words.length;

  prevHintEl.textContent = words[prevIndex]?.word || "";
  nextHintEl.textContent = words[nextIndex]?.word || "";
}

function updateStatusLine() {
  if (!statusLineEl) return;

  const parts = [];
  if (challengeMode) {
    parts.push(`想起学習 ${challengeTime / 1000}秒`);
  }
  if (autoSpeak) {
    parts.push("自動発音 ON");
  }
  if (randomMode) {
    parts.push("ランダム ON");
  }

  statusLineEl.textContent = parts.join(" / ");
}

function updateAutoSpeakButton() {
  updateToggleButton(autoSpeakBtnEl, "自動発音", autoSpeak);
}

function updateChallengeButton() {
  const label = challengeMode
    ? `想起学習 ${challengeTime / 1000}秒`
    : "想起学習";
  updateToggleButton(challengeBtnEl, label, challengeMode);
}

function updateRandomButton() {
  updateToggleButton(randomBtnEl, "ランダム", randomMode);
}

function cycleChallengeTime() {
  const currentIndex = challengeTimes.indexOf(challengeTime);
  const nextIndex = (currentIndex + 1) % challengeTimes.length;
  challengeTime = challengeTimes[nextIndex];
  saveChallengeTimeState();
  updateChallengeButton();

  if (challengeMode) {
    renderCurrentWord();
  }
}

function updateMeaningDisplay(meaning) {
  if (!meaningEl) return;
  clearMeaningRevealTimer();

  if (!challengeMode) {
    meaningEl.textContent = meaning;
    return;
  }

  meaningEl.textContent = "・・・";
  meaningRevealTimer = setTimeout(() => {
    meaningEl.textContent = meaning;
  }, challengeTime);
}

function highlightActiveWord() {
  const currentActive = listEl?.querySelector(".word-item.active");
  const nextActive = listEl?.querySelector(`.word-item[data-index="${index}"]`);

  if (currentActive && currentActive !== nextActive) {
    currentActive.classList.remove("active");
  }
  if (nextActive) {
    nextActive.classList.add("active");
  }
  return nextActive || null;
}

function scrollActiveWordIntoView(activeItem) {
  if (!activeItem) return;

  activeItem.scrollIntoView({
    block: "center",
    behavior: "auto"
  });
}

function applySidebarState() {
  if (!sidebarEl) return;
  sidebarEl.classList.toggle("hidden", !sidebarOpen);
  toggleSidebarBtnEl?.classList.toggle("active", sidebarOpen);
}

function clearMeaningRevealTimer() {
  if (meaningRevealTimer) {
    clearTimeout(meaningRevealTimer);
    meaningRevealTimer = null;
  }
}

function clearAutoSpeakTimer() {
  if (autoSpeakTimer) {
    clearTimeout(autoSpeakTimer);
    autoSpeakTimer = null;
  }
}

function scheduleAutoSpeak() {
  if (!autoSpeak) return;
  autoSpeakTimer = setTimeout(() => {
    speakWord();
  }, 260);
}

function getCurrentWord() {
  return words[index] || null;
}

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  saveSidebarState();
  applySidebarState();
}

function toggleAutoSpeak() {
  autoSpeak = !autoSpeak;
  saveAutoSpeakState();
  updateAutoSpeakButton();

  if (!autoSpeak) {
    clearAutoSpeakTimer();
  } else {
    scheduleAutoSpeak();
  }

  updateStatusLine();
}

function toggleChallengeMode() {
  challengeMode = !challengeMode;
  saveChallengeModeState();
  updateChallengeButton();
  updateStatusLine();
  renderCurrentWord();
}

function toggleRandomMode() {
  randomMode = !randomMode;
  saveRandomModeState();
  updateRandomButton();
  clearNavigationHistory();

  if (!randomMode) {
    clearAllShuffleCache();
  }

  applyWordOrder(true);
  requestListRebuild();
  render();
}

function touchFavoritesChanged() {
  favoritesUpdatedAt = Date.now();
  favoritesVersion += 1;
  saveFavoritesToLocalOnly();
  saveFavoritesUpdatedAt();
  clearAllShuffleCache();
  requestListRebuild();
}

function toggleFavoriteCurrentWord() {
  const current = getCurrentWord();
  if (!current) return;

  const key = makeFavoriteKey(current);

  if (favorites[key]) {
    delete favorites[key];
  } else {
    favorites[key] = {
      addedAt: Date.now()
    };
  }

  touchFavoritesChanged();
  updateFavoriteToggleButton();

  if (currentUser) {
    saveFavoritesToCloud();
  }

  if (currentMode === "favorites") {
    const currentId = current.id;
    applyWordOrder(false);

    const nextIndex = words.findIndex((item) => item.id === currentId);
    index = nextIndex >= 0 ? nextIndex : Math.min(index, Math.max(words.length - 1, 0));

    if (words.length === 0) {
      currentMode = "vol";
      loadSheet(currentVol);
      return;
    }

    indexByVol.favorites = index;
    saveIndexByVol();
  }

  render();
}

async function loadFavoritesMode() {
  await ensureAllVolumesLoaded();

  const favoriteEntries = buildFavoriteEntries();
  if (favoriteEntries.length === 0) {
    alert("☆未登録");
    return;
  }

  currentMode = "favorites";
  clearNavigationHistory();
  applyWordOrder(false);
  index = Math.min(indexByVol.favorites || 0, words.length - 1);
  requestListRebuild();
  render();
}

function prevWord() {
  if (!words.length) return;

  if (randomMode) {
    const historyIndex = getRandomPrevIndexFromHistory();
    if (historyIndex !== null) {
      index = historyIndex;
      renderCurrentWord();
      return;
    }
  }

  const prevIndex = (index - 1 + words.length) % words.length;
  moveToIndex(prevIndex, { pushHistory: randomMode });
}

function nextWord() {
  if (!words.length) return;

  if (randomMode) {
    const historyIndex = getRandomNextIndexFromHistory();
    if (historyIndex !== null) {
      index = historyIndex;
      renderCurrentWord();
      return;
    }
  }

  const nextIndex = (index + 1) % words.length;
  moveToIndex(nextIndex, { pushHistory: randomMode });
}

function updateSpeechButtonAvailability() {
  const supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  if (!speakWordBtnEl) return;

  speakWordBtnEl.disabled = !supported;
  speakWordBtnEl.style.opacity = supported ? "1" : "0.5";
  speakWordBtnEl.title = supported ? "発音" : "この端末では発音未対応";
}

function speakWord() {
  const current = getCurrentWord();
  if (!current) return;
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(current.word);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  utterance.pitch = 1.0;

  window.speechSynthesis.speak(utterance);
}

async function loadPronunciation(word) {
  if (!pronunciationEl) return;

  const normalizedWord = normalizeWord(word);
  const key = `pron_${normalizedWord}`;
  lastPronunciationRequest = normalizedWord;

  const cached = localStorage.getItem(key);
  if (cached !== null) {
    pronunciationEl.textContent = cached || "発音記号なし";
    return;
  }

  if (currentPronunciationController) {
    currentPronunciationController.abort();
  }

  currentPronunciationController = new AbortController();
  pronunciationEl.textContent = "…";

  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { signal: currentPronunciationController.signal }
    );
    const data = await response.json();

    let phonetic = "";
    if (Array.isArray(data) && data[0]) {
      if (data[0].phonetic) {
        phonetic = data[0].phonetic;
      } else if (Array.isArray(data[0].phonetics)) {
        const found = data[0].phonetics.find((item) => item && item.text);
        phonetic = found ? found.text : "";
      }
    }

    phonetic = phonetic.replace(/^\/|\/$/g, "");
    localStorage.setItem(key, phonetic);

    const current = getCurrentWord();
    const currentWord = current ? normalizeWord(current.word) : "";
    if (lastPronunciationRequest === normalizedWord && currentWord === normalizedWord) {
      pronunciationEl.textContent = phonetic || "発音記号なし";
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      const current = getCurrentWord();
      const currentWord = current ? normalizeWord(current.word) : "";
      if (lastPronunciationRequest === normalizedWord && currentWord === normalizedWord) {
        pronunciationEl.textContent = "";
      }
    }
  }
}

function handleSwipe() {
  const diffX = touchEndX - touchStartX;
  const diffY = Math.abs(touchEndY - touchStartY);
  const thresholdX = 50;
  const thresholdY = 50;

  if (Math.abs(diffX) < thresholdX) return;
  if (diffY > thresholdY) return;

  if (diffX > 0) {
    prevWord();
  } else {
    nextWord();
  }
}

try {
  init();
} catch (error) {
  console.error("初期化失敗:", error);
  finishInitialLoading();
  alert(`初期化失敗: ${error.message}`);
}