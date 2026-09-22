const STORAGE_KEY = "word-spark-progress-v1";
const state = {
  words: [], currentIndex: 0, revealed: false, activeView: "study",
  progress: loadProgress(), quiz: null,
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
  return state.progress.words[id] || { seen: 0, correct: 0, wrong: 0 };
}

function recordResult(id, correct) {
  const item = getWordProgress(id);
  item.seen += 1;
  item[correct ? "correct" : "wrong"] += 1;
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
  const entries = Object.values(state.progress.words);
  const mastered = entries.filter((item) => item.correct >= 2 && item.correct > item.wrong).length;
  const review = entries.filter((item) => item.wrong > 0 && item.correct < 2).length;
  const today = (state.progress.daily[todayKey()] || []).length;
  $("#streak-count").textContent = consecutiveDays();
  $("#today-count").textContent = today;
  $("#mastered-count").textContent = mastered;
  $("#review-count").textContent = review;
  $("#daily-ring").style.setProperty("--progress", Math.min(100, (today / 20) * 100));
  $("#seen-total").textContent = entries.filter((item) => item.seen > 0).length;
  $("#mastered-total").textContent = mastered;
  $("#wrong-total").textContent = entries.filter((item) => item.wrong > 0).length;
  renderWrongList();
}

function renderWord() {
  const word = state.words[state.currentIndex];
  if (!word) return;
  state.revealed = false;
  $("#word-position").textContent = `${state.currentIndex + 1} / ${state.words.length}`;
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
}

function revealWord() {
  state.revealed = true;
  $("#word-answer").hidden = false;
  $("#reveal-button").hidden = true;
  $("#decision-buttons").hidden = false;
}

function answerStudy(correct) {
  recordResult(state.words[state.currentIndex].id, correct);
  state.currentIndex = (state.currentIndex + 1) % state.words.length;
  renderWord();
}

function speakCurrentWord() {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(state.words[state.currentIndex].word);
  utterance.lang = "en-US";
  utterance.rate = 0.82;
  window.speechSynthesis.speak(utterance);
}

function switchView(view) {
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
}

function shuffled(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function startQuiz() {
  const selected = shuffled(state.words).slice(0, Math.min(10, state.words.length));
  state.quiz = { questions: selected, index: 0, score: 0, locked: false };
  $("#quiz-start").hidden = true;
  renderQuizQuestion();
}

function quizChoices(word, useEnglish) {
  const answer = useEnglish ? word.word : word.meaning;
  const alternatives = shuffled(state.words.filter((item) => item.id !== word.id))
    .slice(0, 3).map((item) => useEnglish ? item.word : item.meaning);
  return shuffled([answer, ...alternatives]);
}

function renderQuizQuestion() {
  const quiz = state.quiz;
  if (quiz.index >= quiz.questions.length) {
    $("#quiz-direction").textContent = "测验完成";
    $("#quiz-prompt").textContent = `答对 ${quiz.score} / ${quiz.questions.length}`;
    $("#quiz-options").replaceChildren();
    $("#quiz-feedback").textContent = quiz.score >= 8 ? "很棒，今天的单词掌握得不错！" : "再复习一轮，下一次会更好。";
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
  recordResult(word.id, correct);
  button.classList.add(correct ? "correct" : "wrong");
  $$("#quiz-options button").forEach((option) => {
    option.disabled = true;
    if (option.textContent === answer) option.classList.add("correct");
  });
  $("#quiz-feedback").textContent = correct ? "回答正确 ✓" : `正确答案：${answer}`;
  setTimeout(() => { quiz.index += 1; renderQuizQuestion(); }, 850);
}

function renderWrongList() {
  const container = $("#wrong-list");
  if (!container || !state.words.length) return;
  const words = state.words.filter((word) => getWordProgress(word.id).wrong > 0);
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
      const entries = Object.values(state.progress.words);
      return {
        seen: entries.filter((item) => item.seen > 0).length,
        mastered: entries.filter((item) => item.correct >= 2 && item.correct > item.wrong).length,
        needsReview: entries.filter((item) => item.wrong > 0 && item.correct < 2).length,
        totalWords: state.words.length,
      };
    },
  });
}

async function init() {
  const response = await fetch("./data/words.json");
  if (!response.ok) throw new Error("词库加载失败");
  state.words = await response.json();
  renderWord();
  updateStats();
  registerWebMCP();

  $$(".tab").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $("#reveal-button").addEventListener("click", revealWord);
  $("#speak-button").addEventListener("click", speakCurrentWord);
  $$("[data-result]").forEach((button) => button.addEventListener("click", () => answerStudy(button.dataset.result === "known")));
  $("#quiz-start").addEventListener("click", startQuiz);

  document.addEventListener("keydown", (event) => {
    if (state.activeView !== "study" || event.target.matches("button, input")) return;
    if (event.code === "Space") { event.preventDefault(); if (!state.revealed) revealWord(); }
    if (event.key === "ArrowLeft" && state.revealed) answerStudy(false);
    if (event.key === "ArrowRight" && state.revealed) answerStudy(true);
  });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
}

init().catch(() => {
  $("#word-text").textContent = "暂时无法加载";
  $("#word-meaning").textContent = "请刷新页面后再试。";
});

