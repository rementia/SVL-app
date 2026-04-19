import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

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

const STORAGE_KEYS = {
  vol: "tango_current_vol",
  indexByVol: "tango_index_by_vol",
  sidebarOpen: "tango_sidebar_open",
  autoSpeak: "tango_auto_speak",
  favorites: "tango_favorites",
  challengeMode: "tango_challenge_mode",
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
let allWordsByVol = { vol1: [], vol2: [], vol3: [], vol4: [] };
let words = [];
let index = 0;
let currentVol = "vol1";
let currentMode = "vol";
let sidebarOpen = true;
let autoSpeak = false;
let favorites = {};
let challengeMode = false;
let randomMode = false;
let meaningRevealTimer = null;
let autoSpeakTimer = null;
let shuffledWords = [];
let lastPronunciationRequest = "";
let currentPronunciationController = null;
let hasFinishedInitialLoading = false;
let listNeedsRebuild = true;
let renderedListVersion = 0;
let listVersion = 0;
let favoritesVersion = 0;
let indexByVol = { vol1: 0, vol2: 0, vol3: 0, vol4: 0, favorites: 0 };
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
let lastTouchEnd = 0;
let swipeEnabled = false;

function init() {
  loadSavedState();
  bindTouchEvents();
  bindUIEvents();
  setupAuthListener();
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

    index = nextIndex;
    renderCurrentWord();
  });
}

function bindTouchEvents() {
  document.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    if (!touch) return;

    const startTarget = event.target instanceof Element ? event.target : null;
    swipeEnabled = isSwipeAllowedTarget(startTarget);
    touchStartX = touch.screenX;
    touchStartY = touch.screenY;
  }, { passive: true });

  document.addEventListener("touchend", (event) => {
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
  }, { passive: false });
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
  const savedChallengeMode = localStorage.getItem(STORAGE_KEYS.challengeMode);
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

  if (savedChallengeMode !== null) challengeMode = savedChallengeMode === "true";
  if (savedRandomMode !== null) randomMode = savedRandomMode === "true";

  updateAutoSpeakButton();
  updateChallengeButton();
  updateRandomButton();
  applySidebarState();
}

function updateAuthUI() {
  if (!loginBtnEl || !logoutBtnEl) return;
  loginBtnEl.style.display = currentUser ? "none" : "inline-block";
  logoutBtnEl.style.display = currentUser ? "inline-block" : "none";
}

function setupAuthListener() {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    updateAuthUI();

    if (!user) return;

    await loadFavoritesFromCloud();
    requestListRebuild();
    render();
  });
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
function saveChallengeModeState() {
  localStorage.setItem(STORAGE_KEYS.challengeMode, String(challengeMode));
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
        await setDoc(ref, { favorites }, { merge: true });
      }
      return;
    }

    const data = snap.data();
    const cloudFavorites = data && data.favorites && typeof data.favorites === "object" ? data.favorites : {};

    favorites = { ...cloudFavorites, ...favorites };
    favoritesVersion += 1;
    saveFavoritesToLocalOnly();
    await setDoc(ref, { favorites }, { merge: true });
  } catch (error) {
    console.error("クラウド読み込み失敗:", error);
  }
}

async function saveFavoritesToCloud() {
  if (!currentUser) return;

  try {
    const ref = doc(db, "users", currentUser.uid);
    await setDoc(ref, { favorites }, { merge: true });
  } catch (error) {
    console.error("クラウド保存失敗:", error);
  }
}

async function fetchWordsForVol(volName) {
  const response = await fetch(sheetUrls[volName]);
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

async function loadSheet(volName) {
  try {
    currentMode = "vol";
    currentVol = volName;
    shuffledWords = [];
    saveCurrentVol();

    await ensureVolLoaded(volName);

    applyWordOrder(false);
    index = Math.min(indexByVol[volName] || 0, Math.max(words.length - 1, 0));
    requestListRebuild();
    render();
    finishInitialLoading();
  } catch (error) {
    console.error(error);
    finishInitialLoading();
    alert("読み込みに失敗しました。スプレッドシートの共有設定をご確認ください。");
  }
}

function parseCsvToWords(text, volName) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cols = line.split(",");
      const word = (cols.shift() || "").trim();
      let meaning = cols.join(",").trim();
      meaning = meaning.replace(/,+$/, "");
      return { word, meaning, sourceVol: volName };
    })
    .filter((item) => item.word);
}

async function loadPronunciation(word) {
  const normalizedWord = String(word).toLowerCase().trim();
  const key = `pron_${normalizedWord}`;
  if (!pronunciationEl) return;

  lastPronunciationRequest = normalizedWord;
  const cached = localStorage.getItem(key);
  if (cached !== null) {
    pronunciationEl.textContent = cached;
    return;
  }

  if (currentPronunciationController) {
    currentPronunciationController.abort();
  }

  currentPronunciationController = new AbortController();
  pronunciationEl.textContent = "";

  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      signal: currentPronunciationController.signal
    });
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
    if (phonetic) {
      localStorage.setItem(key, phonetic);
    }

    const current = getCurrentWord();
    const currentWord = current ? String(current.word).toLowerCase().trim() : "";
    if (lastPronunciationRequest === normalizedWord && currentWord === normalizedWord) {
      pronunciationEl.textContent = phonetic;
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      const current = getCurrentWord();
      const currentWord = current ? String(current.word).toLowerCase().trim() : "";
      if (lastPronunciationRequest === normalizedWord && currentWord === normalizedWord) {
        pronunciationEl.textContent = "";
      }
    }
  }
}

function makeFavoriteKey(vol, word) {
  return `${vol}::${String(word).toLowerCase().trim()}`;
}
function isFavorite(vol, word) {
  return !!favorites[makeFavoriteKey(vol, word)];
}
function buildFavoriteEntries() {
  const entries = [];
  volOrder.forEach((vol) => {
    (allWordsByVol[vol] || []).forEach((item) => {
      if (isFavorite(vol, item.word)) {
        entries.push({ ...item, sourceVol: vol });
      }
    });
  });
  return entries;
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
  const baseWords = currentMode === "favorites" ? buildFavoriteEntries() : [...(allWordsByVol[currentVol] || [])];

  if (randomMode) {
    if (shuffledWords.length === 0) {
      shuffledWords = shuffleArray(baseWords);
    }
    words = shuffledWords;
  } else {
    shuffledWords = [];
    words = baseWords;
  }

  index = resetIndex ? 0 : Math.min(index, Math.max(words.length - 1, 0));
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
    label.textContent = currentMode === "favorites" ? `${item.word} (${item.sourceVol.replace("vol", "vol.")})` : item.word;
    row.appendChild(label);

    if (isFavorite(item.sourceVol, item.word)) {
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
    if (wordEl) wordEl.textContent = "単語がありません";
    if (meaningEl) meaningEl.textContent = "";
    if (pronunciationEl) pronunciationEl.textContent = "";
    if (prevHintEl) prevHintEl.textContent = "";
    if (nextHintEl) nextHintEl.textContent = "";
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
  currentEl.textContent = currentMode === "favorites" ? "★" : `vol.${currentVol.replace("vol", "")}`;
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

  const active = isFavorite(current.sourceVol, current.word);
  favoriteToggleBtnEl.textContent = active ? "★" : "☆";
  favoriteToggleBtnEl.classList.toggle("active", active);
  favoriteToggleBtnEl.title = active ? "★解除" : "★登録";
}

function updateNavHints() {
  if (!prevHintEl || !nextHintEl) return;
  if (!words.length) {
    prevHintEl.textContent = "";
    nextHintEl.textContent = "";
    return;
  }

  const prevIndex = (index - 1 + words.length) % words.length;
  const nextIndex = (index + 1) % words.length;
  prevHintEl.textContent = words[prevIndex]?.word || "";
  nextHintEl.textContent = words[nextIndex]?.word || "";
}

function updateAutoSpeakButton() {
  updateToggleButton(autoSpeakBtnEl, "自動発音", autoSpeak);
}
function updateChallengeButton() {
  updateToggleButton(challengeBtnEl, "想起学習", challengeMode);
}
function updateRandomButton() {
  updateToggleButton(randomBtnEl, "ランダム", randomMode);
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
  }, 1500);
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
  if (activeItem) {
    activeItem.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function applySidebarState() {
  if (!sidebarEl) return;
  sidebarEl.classList.toggle("hidden", !sidebarOpen);
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
  autoSpeakTimer = setTimeout(() => speakWord(), 150);
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
  if (!autoSpeak) clearAutoSpeakTimer();
}
function toggleChallengeMode() {
  challengeMode = !challengeMode;
  saveChallengeModeState();
  updateChallengeButton();
  renderCurrentWord();
}
function toggleRandomMode() {
  randomMode = !randomMode;
  saveRandomModeState();
  updateRandomButton();
  applyWordOrder(true);
  requestListRebuild();
  render();
}

function toggleFavoriteCurrentWord() {
  const current = getCurrentWord();
  if (!current || !current.sourceVol) return;

  const key = makeFavoriteKey(current.sourceVol, current.word);
  if (favorites[key]) {
    delete favorites[key];
  } else {
    favorites[key] = true;
  }

  favoritesVersion += 1;
  saveFavoritesToLocalOnly();
  requestListRebuild();
  updateFavoriteToggleButton();

  if (currentUser) {
    saveFavoritesToCloud();
  }

  if (currentMode === "favorites") {
    const favoriteEntries = buildFavoriteEntries();
    if (favoriteEntries.length === 0) {
      currentMode = "vol";
      loadSheet(currentVol);
      return;
    }

    applyWordOrder(false);
    index = Math.min(index, words.length - 1);
    indexByVol.favorites = index;
    saveIndexByVol();
  }

  render();
}

async function loadFavoritesMode() {
  await ensureAllVolumesLoaded();
  const favoriteEntries = buildFavoriteEntries();
  if (favoriteEntries.length === 0) {
    alert("★未登録");
    return;
  }

  currentMode = "favorites";
  shuffledWords = [];
  applyWordOrder(false);
  index = Math.min(indexByVol.favorites || 0, words.length - 1);
  requestListRebuild();
  render();
}

function prevWord() {
  if (!words.length) return;
  index = (index - 1 + words.length) % words.length;
  renderCurrentWord();
}
function nextWord() {
  if (!words.length) return;
  index = (index + 1) % words.length;
  renderCurrentWord();
}
function speakWord() {
  const current = getCurrentWord();
  if (!current) return;

  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(current.word);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  utterance.pitch = 1.0;
  speechSynthesis.speak(utterance);
}

function handleSwipe() {
  const diffX = touchEndX - touchStartX;
  const diffY = Math.abs(touchEndY - touchStartY);
  const thresholdX = 50;
  const thresholdY = 50;

  if (Math.abs(diffX) < thresholdX) return;
  if (diffY > thresholdY) return;
  if (diffX > 0) prevWord();
  else nextWord();
}

try {
  init();
} catch (error) {
  console.error("初期化失敗:", error);
  finishInitialLoading();
  alert(`初期化失敗: ${error.message}`);
}