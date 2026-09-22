const STORAGE_KEY = "word-spark-progress-v1";
const state = {
  words: [], currentIndex: 0, revealed: false, activeView: "study",
  studyWords: [], taskWords: [], selectedUnits: [], reviewMode: false,
  progress: loadProgress(), quiz: null, spelling: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const dateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const todayKey = () => dateKey();

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    return {
      words: saved.words || {},
      studyDates: Array.isArray(saved.studyDates) ? saved.studyDates : [],
      daily: saved.daily || {},
    };
  } catch {
    return { words: {}, studyDates: [], daily: {} };
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
  updateStats();
}

function getWordProgress(id) {
  const item = state.progress.words[id] || { seen: 0, correct: 0, wrong: 0 };
  if (typeof item.needsReview !== "boolean") item.needsReview = item.wrong > 0;
  if (typeof item.reviewQuizPassed !== "boolean") item.reviewQuizPassed = false;
  if (typeof item.reviewSpellingPassed !== "boolean") item.reviewSpellingPassed = false;
  return item;
}

function recordResult(id, correct, source = "study") {
  const item = getWordProgress(id);
  item.seen += 1;
  item[correct ? "correct" : "wrong"] += 1;
  if (!correct) {
    item.needsReview = true;
    item.reviewQuizPassed = false;
    item.reviewSpellingPassed = false;
  } else if (item.needsReview && source === "quiz") {
    item.reviewQuizPassed = true;
  } else if (item.needsReview && source === "spelling") {
    item.reviewSpellingPassed = true;
  }
  if (item.needsReview && item.reviewQuizPassed && item.reviewSpellingPassed) {
    item.needsReview = false;
  }
  item.lastStudied = todayKey();
  state.progress.words[id] = item;
  const key = todayKey();
  state.progress.daily[key] = [...new Set([...(state.progress.daily[key] || []), id])];
  if (!state.progress.studyDates.includes(key)) state.progress.studyDates.push(key);
  saveProgress();
}

function consecutiveDays() {
  const dates = new Set(state.progress.studyDates);
  let cursor = new Date();
  if (!dates.has(todayKey())) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (dates.has(dateKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function updateStats() {
  const entries = state.taskWords.map((word) => getWordProgress(word.id));
  const mastered = entries.filter((item) => item.correct >= 2 && item.correct > item.wrong).length;
  const review = entries.filter((item) => item.needsReview).length;
  const selectedIds = new Set(state.taskWords.map((word) => word.id));
  const today = (state.progress.daily[todayKey()] || []).filter((id) => selectedIds.has(id)).length;
  $("#streak-count").textContent = consecutiveDays();
  $("#today-count").textContent = today;
  $("#mastered-count").textContent = mastered;
  $("#review-count").textContent = review;
  $("#daily-ring").style.setProperty("--progress", Math.min(100, (today / 20) * 100));
  $("#seen-total").textContent = entries.filter((item) => item.seen > 0).length;
  $("#mastered-total").textContent = mastered;
  $("#wrong-total").textContent = review;
  $("#word-total").textContent = `所选单元共 ${state.taskWords.length} 个`;
  renderWrongList();
}

function getReviewWords() {
  return state.taskWords.filter((word) => getWordProgress(word.id).needsReview);
}

function currentStudyWords() {
  return state.studyWords.length ? state.studyWords : state.taskWords;
}

function renderWord() {
  const words = currentStudyWords();
  const word = words[state.currentIndex];
  if (!word) return;
  state.revealed = false;
  $("#study-heading").textContent = state.reviewMode ? "再次练习" : "所选单元的单词";
  $("#word-position").textContent = `${state.currentIndex + 1} / ${words.length}`;
  $("#word-unit").textContent = word.unit;
  $("#word-pos").textContent = word.pos;
  $("#word-text").textContent = word.word;
  $("#word-phonetic").textContent = word.phonetic;
  $("#word-meaning").textContent = word.meaning;
  $("#word-example").textContent = word.example;
  $("#word-example-zh").textContent = word.exampleZh;
  $("#word-answer").hidden = true;
  $("#reveal-button").hidden = false;
  $("#decision-buttons").hidden = true;
  speakWord(word.word);
}

function revealWord() {
  state.revealed = true;
  $("#word-answer").hidden = false;
  $("#reveal-button").hidden = true;
  $("#decision-buttons").hidden = false;
}

function answerStudy(correct) {
  const words = currentStudyWords();
  recordResult(words[state.currentIndex].id, correct, "study");
  state.currentIndex = (state.currentIndex + 1) % words.length;
  renderWord();
}

const VOICE_KEY = "word-spark-voice-v1";
let englishVoices = [];
let preferredVoice = "";
let currentUtterance = null;
try { preferredVoice = localStorage.getItem(VOICE_KEY) || ""; } catch {}

function refreshVoices() {
  if (!("speechSynthesis" in window)) {
    $("#voice-status").textContent = "当前浏览器不支持朗读。";
    $("#voice-select").disabled = true;
    $("#test-voice").disabled = true;
    return;
  }
  const quality = (voice) => (/^en[-_]GB$/i.test(voice.lang) ? 100 : 0)
    + (/premium|enhanced|natural|neural/i.test(voice.name) ? 10 : 0);
  englishVoices = window.speechSynthesis.getVoices()
    .filter((voice) => /^en(?:[-_]|$)/i.test(voice.lang))
    .sort((a, b) => quality(b) - quality(a));
  const select = $("#voice-select");
  select.replaceChildren(new Option("自动选择（优先英式）", ""));
  englishVoices.forEach((voice) => select.add(new Option(`${voice.name} · ${voice.lang}`, voice.voiceURI)));
  select.value = englishVoices.some((voice) => voice.voiceURI === preferredVoice) ? preferredVoice : "";
  const voice = englishVoices.find((item) => item.voiceURI === preferredVoice) || englishVoices[0];
  $("#voice-status").textContent = voice ? `当前：${voice.name}（${voice.lang}）` : "使用设备默认英式英语语音。";
}

function speakWord(text) {
  if (!("speechSynthesis" in window)) return;
  try {
    refreshVoices();
    window.speechSynthesis.cancel();
    const spokenText = text === "ICT" ? "I C T" : text;
    const utterance = new SpeechSynthesisUtterance(spokenText);
    const voice = englishVoices.find((item) => item.voiceURI === preferredVoice) || englishVoices[0];
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "en-GB";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    currentUtterance = utterance;
    utterance.onend = () => { if (currentUtterance === utterance) currentUtterance = null; };
    utterance.onerror = (event) => {
      if (!["canceled", "interrupted"].includes(event.error)) {
        $("#voice-status").textContent = "朗读未能启动，请点击音符重试或选择另一种英语语音。";
      }
      if (currentUtterance === utterance) currentUtterance = null;
    };
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.warn("朗读失败", error);
    $("#voice-status").textContent = "朗读暂不可用，可继续练习或更换英语语音。";
  }
}

function speakCurrentWord() {
  const word = currentStudyWords()[state.currentIndex];
  if (word) speakWord(word.word);
}

function switchView(view) {
  const previousView = state.activeView;
  if (view === "study" && previousView !== "study" && state.reviewMode) {
    const reviewWords = getReviewWords();
    state.studyWords = reviewWords.length ? reviewWords : state.taskWords;
    state.reviewMode = reviewWords.length > 0;
    state.currentIndex = 0;
  }
  state.activeView = view;
  $$(".tab").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active);
  });
  $$(".view").forEach((section) => {
    const active = section.id === `${view}-view`;
    section.hidden = !active;
    section.classList.toggle("is-active", active);
  });
  if (view === "progress") updateStats();
  if (view === "study" && previousView !== "study") renderWord();
}

function shuffled(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function startQuiz() {
  const reviewWords = getReviewWords();
  const selected = reviewWords.length ? shuffled(reviewWords) : shuffled(state.taskWords).slice(0, Math.min(10, state.taskWords.length));
  state.quiz = { questions: selected, index: 0, score: 0, locked: false };
  $("#quiz-heading").textContent = `${selected.length} 题认一认`;
  $("#quiz-start").hidden = true;
  renderQuizQuestion();
}

function quizChoices(word, useEnglish) {
  const answer = useEnglish ? word.word : word.meaning;
  const alternatives = shuffled([...new Set(state.taskWords
    .map((item) => useEnglish ? item.word : item.meaning)
    .filter((value) => value !== answer))]).slice(0, 3);
  return shuffled([answer, ...alternatives]);
}

function renderQuizQuestion() {
  const quiz = state.quiz;
  if (quiz.index >= quiz.questions.length) {
    $("#quiz-direction").textContent = "测验完成";
    $("#quiz-prompt").textContent = `答对 ${quiz.score} / ${quiz.questions.length}`;
    $("#quiz-options").replaceChildren();
    $("#quiz-feedback").textContent = quiz.score >= Math.ceil(quiz.questions.length * 0.8)
      ? "很棒，今天的单词掌握得不错！"
      : "再复习一轮，下一次会更好。";
    $("#quiz-start").textContent = "再测一次";
    $("#quiz-start").hidden = false;
    $("#quiz-position").textContent = "已完成";
    return;
  }
  quiz.locked = false;
  const word = quiz.questions[quiz.index];
  const askChinese = quiz.index % 2 === 0;
  $("#quiz-position").textContent = `${quiz.index + 1} / ${quiz.questions.length}`;
  $("#quiz-direction").textContent = askChinese ? "选择正确的中文释义" : "选择正确的英文单词";
  $("#quiz-prompt").textContent = askChinese ? word.word : word.meaning;
  $("#quiz-feedback").textContent = "";
  const options = quizChoices(word, !askChinese);
  $("#quiz-options").replaceChildren(...options.map((value) => {
    const button = document.createElement("button");
    button.textContent = value;
    button.addEventListener("click", () => answerQuiz(button, value, askChinese ? word.meaning : word.word));
    return button;
  }));
}

function answerQuiz(button, chosen, answer) {
  const quiz = state.quiz;
  if (quiz.locked) return;
  quiz.locked = true;
  const word = quiz.questions[quiz.index];
  const correct = chosen === answer;
  if (correct) quiz.score += 1;
  recordResult(word.id, correct, "quiz");
  button.classList.add(correct ? "correct" : "wrong");
  $$("#quiz-options button").forEach((option) => {
    option.disabled = true;
    if (option.textContent === answer) option.classList.add("correct");
  });
  $("#quiz-feedback").textContent = correct ? "回答正确 ✓" : `正确答案：${answer}`;
  setTimeout(() => {
    if (state.quiz !== quiz) return;
    quiz.index += 1; renderQuizQuestion();
  }, 850);
}

function startSpelling() {
  const reviewWords = getReviewWords();
  const selected = reviewWords.length ? shuffled(reviewWords) : shuffled(state.taskWords).slice(0, Math.min(10, state.taskWords.length));
  state.spelling = { questions: selected, index: 0, score: 0, answered: false };
  $("#spelling-heading").textContent = `${selected.length} 题拼一拼`;
  $("#spelling-start").hidden = true;
  renderSpellingQuestion();
}

function renderSpellingQuestion() {
  const spelling = state.spelling;
  if (spelling.index >= spelling.questions.length) {
    $("#spelling-position").textContent = "已完成";
    $("#spelling-label").textContent = "拼写练习完成";
    $("#spelling-prompt").textContent = `答对 ${spelling.score} / ${spelling.questions.length}`;
    $("#spelling-form").hidden = true;
    $("#spelling-next").hidden = true;
    $("#spelling-feedback").replaceChildren();
    $("#spelling-start").textContent = "再拼一次";
    $("#spelling-start").hidden = false;
    return;
  }

  spelling.answered = false;
  const word = spelling.questions[spelling.index];
  $("#spelling-position").textContent = `${spelling.index + 1} / ${spelling.questions.length}`;
  $("#spelling-label").textContent = `${word.unit} · ${word.pos}`;
  $("#spelling-prompt").textContent = word.meaning;
  $("#spelling-feedback").replaceChildren();
  $("#spelling-form").hidden = false;
  $("#spelling-next").hidden = true;
  const answer = word.word.toLowerCase();
  const letters = [...answer].map((character, index) => /[a-z]/.test(character) ? index : -1).filter((index) => index >= 0);
  // Short entries such as "as" and "a.m." still need at least one answer letter.
  const hints = new Set(letters.length > 2 ? [letters[0], letters[letters.length - 1]] : [letters[0]]);
  $("#spelling-first").textContent = "";
  $("#spelling-last").textContent = "";
  const slots = $("#spelling-slots");
  slots.replaceChildren();
  const missingCount = letters.length - hints.size;
  slots.setAttribute("aria-label", `填写 ${missingCount} 个缺失字母，空格和标点已给出`);
  [...answer].forEach((character, position) => {
    if (!/[a-z]/.test(character) || hints.has(position)) {
      const fixed = document.createElement("span");
      fixed.className = character === " " ? "spelling-space" : "spelling-fixed";
      fixed.textContent = character === " " ? "\u00a0" : character;
      slots.append(fixed);
      return;
    }
    const input = document.createElement("input");
    input.className = "spelling-letter";
    input.dataset.position = position;
    input.type = "text";
    input.inputMode = "text";
    input.maxLength = 1;
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;
    input.setAttribute("aria-label", `第 ${position + 1} 个字符，填写字母`);
    const inputs = () => [...slots.querySelectorAll("input")];
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^a-z]/gi, "").slice(-1).toLowerCase();
      const fields = inputs();
      if (input.value) fields[fields.indexOf(input) + 1]?.focus();
    });
    input.addEventListener("keydown", (event) => {
      const fields = inputs();
      const index = fields.indexOf(input);
      if (event.key === "Backspace" && !input.value && index > 0) {
        event.preventDefault();
        fields[index - 1].value = "";
        fields[index - 1].focus();
      }
      if (event.key === "ArrowLeft") fields[index - 1]?.focus();
      if (event.key === "ArrowRight") fields[index + 1]?.focus();
    });
    input.addEventListener("paste", (event) => {
      event.preventDefault();
      const pasted = event.clipboardData.getData("text").replace(/[^a-z]/gi, "").toLowerCase();
      const fields = inputs();
      const index = fields.indexOf(input);
      [...pasted].forEach((letter, offset) => {
        if (fields[index + offset]) fields[index + offset].value = letter;
      });
      fields[Math.min(index + pasted.length, fields.length - 1)]?.focus();
    });
    slots.append(input);
  });
  slots.querySelector("input")?.focus();
}

function answerSpelling(event) {
  event.preventDefault();
  const spelling = state.spelling;
  if (!spelling || spelling.answered) return;
  const word = spelling.questions[spelling.index];
  const inputs = $$("#spelling-slots .spelling-letter");
  const firstEmpty = inputs.find((input) => !input.value);
  if (firstEmpty) {
    firstEmpty.focus();
    return;
  }
  const target = word.word.toLowerCase();
  const characters = [...target];
  inputs.forEach((input) => { characters[Number(input.dataset.position)] = input.value.toLowerCase(); });
  const answer = characters.join("");

  spelling.answered = true;
  const correct = answer === target;
  if (correct) spelling.score += 1;
  recordResult(word.id, correct, "spelling");
  inputs.forEach((input) => { input.disabled = true; });
  $("#spelling-next").hidden = false;

  const result = document.createElement("p");
  result.className = `spelling-result ${correct ? "is-correct" : "is-wrong"}`;
  if (correct) {
    result.innerHTML = "<span aria-hidden=\"true\">✓</span><strong>拼写正确</strong>";
  } else {
    const mark = document.createElement("span");
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "×";
    const title = document.createElement("strong");
    title.textContent = `正确拼写：${word.word}`;
    const note = document.createElement("small");
    note.textContent = `你的答案：${answer}`;
    result.append(mark, title, note);
  }
  $("#spelling-feedback").replaceChildren(result);
}

function nextSpellingQuestion() {
  if (!state.spelling?.answered) return;
  state.spelling.index += 1;
  renderSpellingQuestion();
}

function renderWrongList() {
  const container = $("#wrong-list");
  if (!container || !state.words.length) return;
  const words = getReviewWords();
  $("#review-again").hidden = !words.length;
  if (!words.length) {
    const empty = document.createElement("span");
    empty.className = "empty";
    empty.textContent = "还没有错词";
    container.replaceChildren(empty);
    return;
  }
  container.replaceChildren(...words.map((word) => {
    const chip = document.createElement("span");
    chip.textContent = word.word;
    return chip;
  }));
}

function startReviewSession() {
  const words = getReviewWords();
  if (!words.length) return;
  state.studyWords = words;
  state.reviewMode = true;
  state.currentIndex = 0;
  switchView("study");
}

function registerWebMCP() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  context.registerTool({
    name: "get_vocabulary_progress",
    title: "查看单词学习进度",
    description: "读取词光中保存在当前设备上的学习统计。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute() {
      const entries = Object.keys(state.progress.words).map((id) => getWordProgress(id));
      return {
        seen: entries.filter((item) => item.seen > 0).length,
        mastered: entries.filter((item) => item.correct >= 2 && item.correct > item.wrong).length,
        needsReview: entries.filter((item) => item.needsReview).length,
        totalWords: state.words.length,
      };
    },
  });
}

function renderUnitPicker() {
  const units = [...new Set(state.words.map((word) => word.unit))];
  $("#unit-options").replaceChildren(...units.map((unit) => {
    const label = document.createElement("label");
    label.className = "unit-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "unit";
    input.value = unit;
    input.checked = state.selectedUnits.includes(unit);
    input.addEventListener("change", updateUnitSummary);
    const text = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = unit;
    const count = document.createElement("small");
    count.textContent = `${state.words.filter((word) => word.unit === unit).length} 个单词和短语`;
    text.append(title, count);
    label.append(input, text);
    return label;
  }));
  updateUnitSummary();
}

function updateUnitSummary() {
  const units = $$("#unit-options input:checked").map((input) => input.value);
  const count = state.words.filter((word) => units.includes(word.unit)).length;
  $("#unit-summary").textContent = units.length ? `已选 ${units.length} 个单元，共 ${count} 个单词和短语` : "请至少选择一个单元。";
  $("#start-task").disabled = !count;
}

function showUnitPicker() {
  window.speechSynthesis?.cancel();
  renderUnitPicker();
  $("#unit-picker").hidden = false;
  $("#learning-app").hidden = true;
  $("#cancel-units").hidden = !state.taskWords.length;
  $("#unit-options input")?.focus();
}

function startTask(event) {
  event.preventDefault();
  const units = $$("#unit-options input:checked").map((input) => input.value);
  if (!units.length) return;
  state.selectedUnits = units;
  state.taskWords = state.words.filter((word) => units.includes(word.unit));
  state.studyWords = state.taskWords;
  state.currentIndex = 0;
  state.reviewMode = false;
  state.quiz = null;
  state.spelling = null;
  $("#quiz-heading").textContent = "10 题认一认";
  $("#quiz-position").textContent = "准备开始";
  $("#quiz-direction").textContent = "从所选单元随机出题，优先复习错词。";
  $("#quiz-prompt").textContent = "检验一下学习成果";
  $("#quiz-options").replaceChildren();
  $("#quiz-feedback").textContent = "";
  $("#quiz-start").hidden = false;
  $("#quiz-start").textContent = "开始认一认";
  $("#spelling-heading").textContent = "10 题拼一拼";
  $("#spelling-position").textContent = "准备开始";
  $("#spelling-label").textContent = "根据中文和字母提示，补全英文；空格和标点已给出。";
  $("#spelling-prompt").textContent = "准备好挑战拼写了吗？";
  $("#spelling-form").hidden = true;
  $("#spelling-next").hidden = true;
  $("#spelling-feedback").replaceChildren();
  $("#spelling-start").hidden = false;
  $("#spelling-start").textContent = "开始拼一拼";
  $("#task-summary").textContent = `${units.join(" + ")} · ${state.taskWords.length} 个词条`;
  $("#unit-picker").hidden = true;
  $("#learning-app").hidden = false;
  // Render once, inside the user's tap, to allow speech on iPad/iPhone.
  state.activeView = "study";
  switchView("study");
  renderWord();
  updateStats();
  $("#reveal-button").focus({ preventScroll: true });
}

async function init() {
  const response = await fetch("./data/words.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("词库加载失败");
  const words = await response.json();
  const keys = ["id", "word", "phonetic", "pos", "meaning", "example", "exampleZh", "unit"];
  if (!Array.isArray(words) || !words.length || words.some((word) => !word || keys.some((key) => typeof word[key] !== "string" || !word[key].trim())) || new Set(words.map((word) => word.id)).size !== words.length) {
    throw new Error("词库格式不正确");
  }
  state.words = words;
  renderUnitPicker();
  $("#load-status").hidden = true;
  $("#unit-form").hidden = false;
  refreshVoices();
  window.speechSynthesis?.addEventListener("voiceschanged", refreshVoices);
  try { registerWebMCP(); } catch (error) { console.warn("进度工具不可用", error); }

  $("#unit-form").addEventListener("submit", startTask);
  $("#select-all").addEventListener("click", () => { $$("#unit-options input").forEach((input) => { input.checked = true; }); updateUnitSummary(); });
  $("#clear-units").addEventListener("click", () => { $$("#unit-options input").forEach((input) => { input.checked = false; }); updateUnitSummary(); });
  $("#change-units").addEventListener("click", showUnitPicker);
  $("#cancel-units").addEventListener("click", () => { $("#unit-picker").hidden = true; $("#learning-app").hidden = false; });
  $("#voice-select").addEventListener("change", (event) => {
    preferredVoice = event.target.value;
    try { localStorage.setItem(VOICE_KEY, preferredVoice); } catch {}
    speakCurrentWord();
  });
  $("#test-voice").addEventListener("click", speakCurrentWord);
  $$(".tab").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $("#reveal-button").addEventListener("click", revealWord);
  $("#speak-button").addEventListener("click", speakCurrentWord);
  $$("[data-result]").forEach((button) => button.addEventListener("click", () => answerStudy(button.dataset.result === "known")));
  $("#quiz-start").addEventListener("click", startQuiz);
  $("#spelling-start").addEventListener("click", startSpelling);
  $("#spelling-form").addEventListener("submit", answerSpelling);
  $("#spelling-next").addEventListener("click", nextSpellingQuestion);
  $("#review-again").addEventListener("click", startReviewSession);

  document.addEventListener("keydown", (event) => {
    if (!$("#unit-picker").hidden || state.activeView !== "study" || event.target.matches("button, input, select")) return;
    if (event.code === "Space") { event.preventDefault(); if (!state.revealed) revealWord(); }
    if (event.key === "ArrowLeft" && state.revealed) answerStudy(false);
    if (event.key === "ArrowRight" && state.revealed) answerStudy(true);
  });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("离线缓存暂不可用", error));
}

init().catch((error) => {
  console.error("启动失败", error);
  $("#load-status").hidden = false;
  $("#load-status").textContent = "暂时无法加载词库，请联网后刷新页面重试。";
});
