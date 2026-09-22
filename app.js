const STORAGE_KEY = "word-spark-progress-v1";
const state = {
  words: [], currentIndex: 0, revealed: false, activeView: "study",
  studyWords: [], reviewMode: false,
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
  const entries = Object.keys(state.progress.words).map((id) => getWordProgress(id));
  const mastered = entries.filter((item) => item.correct >= 2 && item.correct > item.wrong).length;
  const review = entries.filter((item) => item.needsReview).length;
  const today = (state.progress.daily[todayKey()] || []).length;
  $("#streak-count").textContent = consecutiveDays();
  $("#today-count").textContent = today;
  $("#mastered-count").textContent = mastered;
  $("#review-count").textContent = review;
  $("#daily-ring").style.setProperty("--progress", Math.min(100, (today / 20) * 100));
  $("#seen-total").textContent = entries.filter((item) => item.seen > 0).length;
  $("#mastered-total").textContent = mastered;
  $("#wrong-total").textContent = review;
  renderWrongList();
}

function getReviewWords() {
  return state.words.filter((word) => getWordProgress(word.id).needsReview);
}

function currentStudyWords() {
  return state.studyWords.length ? state.studyWords : state.words;
}

function renderWord() {
  const words = currentStudyWords();
  const word = words[state.currentIndex];
  if (!word) return;
  state.revealed = false;
  $("#study-eyebrow").textContent = state.reviewMode ? "错词专项复习" : "七年级 · 示例词库";
  $("#study-heading").textContent = state.reviewMode ? "再次练习" : "今天的单词";
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

function speakWord(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.82;
  window.speechSynthesis.speak(utterance);
}

function speakCurrentWord() {
  const word = currentStudyWords()[state.currentIndex];
  if (word) speakWord(word.word);
}

function switchView(view) {
  const previousView = state.activeView;
  if (view === "study" && previousView !== "study" && state.reviewMode) {
    const reviewWords = getReviewWords();
    state.studyWords = reviewWords.length ? reviewWords : state.words;
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
  const selected = reviewWords.length ? shuffled(reviewWords) : shuffled(state.words).slice(0, Math.min(10, state.words.length));
  state.quiz = { questions: selected, index: 0, score: 0, locked: false };
  $("#quiz-heading").textContent = `${selected.length} 题认一认`;
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
  setTimeout(() => { quiz.index += 1; renderQuizQuestion(); }, 850);
}

function startSpelling() {
  const reviewWords = getReviewWords();
  const selected = reviewWords.length ? shuffled(reviewWords) : shuffled(state.words).slice(0, Math.min(10, state.words.length));
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
  const missing = answer.slice(1, -1);
  $("#spelling-first").textContent = answer[0];
  $("#spelling-last").textContent = answer.at(-1);
  const slots = $("#spelling-slots");
  slots.replaceChildren();
  slots.setAttribute("aria-label", `${answer[0]} 开头、${answer.at(-1)} 结尾，填写中间 ${missing.length} 个字母`);
  [...missing].forEach((_, index) => {
    const input = document.createElement("input");
    input.className = "spelling-letter";
    input.type = "text";
    input.inputMode = "text";
    input.maxLength = 1;
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;
    input.setAttribute("aria-label", `第 ${index + 1} 个缺失字母，共 ${missing.length} 个`);
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^a-z]/gi, "").slice(-1).toLowerCase();
      if (input.value) slots.children[index + 1]?.focus();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && index > 0) {
        event.preventDefault();
        const previous = slots.children[index - 1];
        previous.value = "";
        previous.focus();
      }
      if (event.key === "ArrowLeft" && index > 0) slots.children[index - 1].focus();
      if (event.key === "ArrowRight") slots.children[index + 1]?.focus();
    });
    input.addEventListener("paste", (event) => {
      event.preventDefault();
      const letters = event.clipboardData.getData("text").replace(/[^a-z]/gi, "").toLowerCase();
      [...letters].forEach((letter, offset) => {
        const targetSlot = slots.children[index + offset];
        if (targetSlot) targetSlot.value = letter;
      });
      const nextIndex = Math.min(index + letters.length, slots.children.length - 1);
      slots.children[nextIndex]?.focus();
    });
    slots.append(input);
  });
  slots.firstElementChild?.focus();
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
  const middle = inputs.map((input) => input.value).join("").toLowerCase();
  const target = word.word.toLowerCase();
  const answer = `${target[0]}${middle}${target.at(-1)}`;

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

async function init() {
  const response = await fetch("./data/words.json");
  if (!response.ok) throw new Error("词库加载失败");
  state.words = await response.json();
  state.studyWords = state.words;
  renderWord();
  updateStats();
  registerWebMCP();

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

