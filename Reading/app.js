"use strict";
const P = window.ReadingProgress;
let readingStorage;
try { readingStorage = window.localStorage; } catch { readingStorage = { getItem: () => null, setItem: () => { throw new Error("Storage unavailable"); } }; }
const $ = (selector) => document.querySelector(selector);
const state = {
  catalog: [], cache: new Map(), document: null, index: 0, view: "library",
  progress: P.load(readingStorage), sessionMs: 0, runStart: null, paused: false,
  font: 26, request: 0, lastSaved: 0, storageFailed: false,
};
try { const size = Number(readingStorage.getItem("aden-reading-font-v1")); if (size >= 20 && size <= 34) state.font = size; } catch {}

function saveProgress() {
  try {
    readingStorage.setItem(P.key, JSON.stringify(state.progress));
    state.lastSaved = Date.now();
  } catch {
    state.storageFailed = true;
    $("#app-status").textContent = "当前浏览器无法保存记录，请允许网站存储。阅读和计时仍可继续，离开前可在阅读记录中导出备份。";
    $("#app-status").classList.add("storage-warning");
  }
}
function currentPassage() { return state.document?.passages[state.index]; }
function canTime() { return state.view === "reader" && !document.hidden && !state.paused && !!currentPassage(); }
function flushTime(now = Date.now(), save = true) {
  if (state.runStart !== null) {
    const elapsed = Math.max(0, now - state.runStart);
    P.addInterval(state.progress, state.document.id, currentPassage().id, state.runStart, now);
    state.sessionMs += elapsed;
    state.runStart = now;
    if (save && elapsed > 0) saveProgress();
  }
}
function stopTimer() { flushTime(); state.runStart = null; renderStats(); renderTimer(); }
function startTimer() { if (canTime() && state.runStart === null) state.runStart = Date.now(); renderTimer(); }
function renderTimer() {
  const active = state.runStart !== null && canTime();
  $("#timer-status").textContent = active ? "正在计时" : "计时已暂停";
  $("#timer-dot").classList.toggle("is-paused", !active);
  $("#session-time").textContent = P.clock(state.sessionMs);
  $("#pause-timer").textContent = state.paused ? "继续计时" : "暂停计时";
}
function docLabel(id) { return state.catalog.find((item) => item.id === id)?.label || id; }
function renderStats() {
  const date = new Date();
  const today = state.progress.days[P.dateKey(date)] || { totalMs: 0, documents: {} };
  $("#today-date").textContent = `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  $("#today-time").textContent = P.duration(today.totalMs);
  $("#today-doc-count").textContent = Object.keys(today.documents).length;
  $("#today-passage-count").textContent = Object.values(today.documents).reduce((sum, doc) => sum + Object.keys(doc.passages).length, 0);
  const labels = Object.keys(today.documents).sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]));
  const chips = labels.map((id) => { const span = document.createElement("span"); span.textContent = docLabel(id); return span; });
  if (!chips.length) { const span = document.createElement("span"); span.className = "empty-chip"; span.textContent = "还没有阅读记录"; chips.push(span); }
  $("#today-docs").replaceChildren(...chips);
}
function showView(view) {
  stopTimer();
  state.request += 1;
  state.view = view;
  for (const name of ["library", "reader", "menu", "history"]) $(`#${name}-view`).hidden = name !== view;
  $("#library-tab").classList.toggle("is-active", view !== "history");
  $("#library-tab").setAttribute("aria-pressed", String(view !== "history"));
  $("#history-tab").classList.toggle("is-active", view === "history");
  $("#history-tab").setAttribute("aria-pressed", String(view === "history"));
  if (view === "reader") startTimer();
  if (view === "history") renderHistory();
  if (!state.storageFailed) $("#app-status").textContent = "";
  window.scrollTo({ top: 0, behavior: "auto" });
}
function renderLibrary() {
  const total = state.catalog.reduce((sum, doc) => sum + doc.count, 0);
  $("#library-count").textContent = `${state.catalog.length} 份 · ${total} 篇`;
  $("#document-grid").replaceChildren(...state.catalog.map((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "document-card";
    button.dataset.document = entry.id;
    const number = document.createElement("span"); number.className = "document-number"; number.textContent = entry.label;
    const count = document.createElement("span"); count.className = "document-count"; count.textContent = `${entry.count} 篇短文`;
    const preview = document.createElement("span"); preview.className = "document-preview"; preview.textContent = entry.preview;
    const start = document.createElement("span"); start.className = "document-start"; start.textContent = state.progress.lastRead[entry.id] ? "继续阅读 →" : "开始阅读 →";
    button.append(number, count, preview, start);
    button.addEventListener("click", () => openDocument(entry));
    return button;
  }));
}
function validDocument(value, entry) {
  const ids = new Set();
  return value && value.id === entry.id && Array.isArray(value.passages) && value.passages.length === entry.count && value.passages.every((passage) => {
    if (!passage || typeof passage.id !== "string" || !/^no-\d+-passage-\d+$/.test(passage.id) || ids.has(passage.id) || typeof passage.title !== "string" || !passage.title.trim() || !Array.isArray(passage.paragraphs) || !passage.paragraphs.length || passage.paragraphs.some((text) => typeof text !== "string" || !text.trim())) return false;
    ids.add(passage.id); return true;
  });
}
async function openDocument(entry) {
  const request = ++state.request;
  if (!state.storageFailed) $("#app-status").textContent = `正在打开 ${entry.label}…`;
  try {
    let data = state.cache.get(entry.id);
    if (!data) {
      const response = await fetch(entry.file, { cache: "no-cache" });
      if (!response.ok) throw new Error("Document unavailable");
      data = await response.json();
      if (!validDocument(data, entry)) throw new Error("Invalid document data");
      state.cache.set(entry.id, data);
      cacheDocument(entry.file);
    }
    if (request !== state.request) return;
    stopTimer();
    state.document = data;
    state.sessionMs = 0;
    state.paused = false;
    const saved = state.progress.lastRead[data.id];
    const index = data.passages.findIndex((passage) => passage.id === saved);
    openPassage(index >= 0 ? index : 0);
  } catch (error) {
    if (request !== state.request) return;
    console.warn("阅读材料加载失败", error);
    $("#app-status").textContent = `暂时无法打开 ${entry.label}。请联网后重试；已打开过的文档可在离线时继续阅读。`;
  }
}
function applyFont() {
  document.documentElement.style.setProperty("--reading-size", `${state.font}px`);
  $("#font-label").textContent = `${state.font}px`;
  $("#font-smaller").disabled = state.font <= 20;
  $("#font-larger").disabled = state.font >= 34;
}
function renderPassage() {
  const passage = currentPassage();
  $("#passage-position").textContent = `${state.document.label} · ${state.index + 1} / ${state.document.passages.length}`;
  $("#passage-label").textContent = `${state.document.label} / PASSAGE ${String(state.index + 1).padStart(2, "0")}`;
  $("#passage-title").textContent = passage.title;
  $("#passage-body").replaceChildren(...passage.paragraphs.map((text) => {
    const p = document.createElement("p");
    for (const part of text.split(/(（[^）]*）)/g)) {
      if (/^（.*）$/.test(part)) { const span = document.createElement("span"); span.className = "gloss"; span.lang = "zh-CN"; span.textContent = part; p.append(span); }
      else p.append(document.createTextNode(part));
    }
    return p;
  }));
  $("#previous").disabled = state.index === 0;
  $("#next").disabled = state.index === state.document.passages.length - 1;
  applyFont();
}
function openPassage(index) {
  if (!state.document || index < 0 || index >= state.document.passages.length) return;
  stopTimer();
  state.index = index;
  state.progress.lastRead[state.document.id] = currentPassage().id;
  saveProgress();
  renderPassage();
  showView("reader");
  $("#passage-title").focus({ preventScroll: true });
}
function showMenu() {
  if (!state.document) return;
  $("#menu-label").textContent = `${state.document.label} / ${state.document.passages.length} PASSAGES`;
  $("#menu-heading").textContent = `${state.document.label} 短文目录`;
  $("#passage-menu").replaceChildren(...state.document.passages.map((passage, index) => {
    const li = document.createElement("li"); const button = document.createElement("button"); button.type = "button";
    button.classList.toggle("is-current", index === state.index);
    if (index === state.index) button.setAttribute("aria-current", "true");
    const number = document.createElement("span"); number.className = "menu-number"; number.textContent = String(index + 1).padStart(2, "0");
    const text = document.createElement("span"); text.className = "menu-text";
    const title = document.createElement("strong"); title.textContent = passage.title;
    const preview = document.createElement("small"); preview.textContent = passage.paragraphs[0];
    text.append(title, preview); button.append(number, text); li.append(button);
    button.addEventListener("click", () => openPassage(index)); return li;
  }));
  showView("menu");
}
function renderHistory() {
  const days = Object.entries(state.progress.days).filter(([, day]) => day.totalMs > 0).sort(([a], [b]) => b.localeCompare(a));
  $("#total-time").textContent = P.duration(days.reduce((sum, [, day]) => sum + day.totalMs, 0));
  $("#reading-days").textContent = `${days.length} 天`;
  if (!days.length) {
    const empty = document.createElement("div"); empty.className = "empty-state"; empty.textContent = "还没有阅读记录。选择一份文档，开始你的第一篇朗读吧。";
    $("#history-list").replaceChildren(empty); return;
  }
  $("#history-list").replaceChildren(...days.map(([date, day], index) => {
    const details = document.createElement("details"); details.className = "day-record"; details.open = index === 0;
    const summary = document.createElement("summary"); const title = document.createElement("strong"); title.textContent = date;
    const description = document.createElement("span"); description.textContent = `${P.duration(day.totalMs)} · ${Object.keys(day.documents).length} 份文档`;
    summary.append(title, description); const ul = document.createElement("ul");
    for (const [id, doc] of Object.entries(day.documents).sort(([a], [b]) => Number(a.split("-")[1]) - Number(b.split("-")[1]))) {
      const li = document.createElement("li"); const label = document.createElement("strong"); label.textContent = docLabel(id);
      const value = document.createElement("span"); value.textContent = `${P.duration(doc.ms)} · ${Object.keys(doc.passages).length} 篇短文`;
      li.append(label, value); ul.append(li);
    }
    details.append(summary, ul); return details;
  }));
}
function exportRecords() {
  stopTimer();
  const blob = new Blob([JSON.stringify(state.progress, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `reading-records-${P.dateKey(new Date())}.json`; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function cacheDocument(file) {
  if (!navigator.serviceWorker) return;
  navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage({ type: "CACHE_DOCUMENT", file });
  }).catch(() => {});
}
async function init() {
  const response = await fetch("./data/catalog.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("Catalog unavailable");
  const catalog = await response.json();
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.documents) || !catalog.documents.length || new Set(catalog.documents.map((doc) => doc.id)).size !== catalog.documents.length || catalog.documents.some((doc) => !/^no-\d+$/.test(doc.id) || !Number.isInteger(doc.count) || doc.count <= 0 || typeof doc.label !== "string" || typeof doc.preview !== "string" || !/^\.\/data\/no-\d+\.json$/.test(doc.file))) throw new Error("Invalid catalog");
  state.catalog = catalog.documents.slice().sort((a, b) => a.number - b.number);
  renderLibrary(); renderStats(); applyFont();
  $("#app-status").textContent = "";
  $("#library-tab").addEventListener("click", () => { showView("library"); renderLibrary(); });
  $("#history-tab").addEventListener("click", () => showView("history"));
  $("#previous").addEventListener("click", () => openPassage(state.index - 1));
  $("#next").addEventListener("click", () => openPassage(state.index + 1));
  $("#menu").addEventListener("click", showMenu);
  $("#continue-reading").addEventListener("click", () => openPassage(state.index));
  $("#pause-timer").addEventListener("click", () => { stopTimer(); state.paused = !state.paused; startTimer(); });
  for (const [selector, delta] of [["#font-smaller", -2], ["#font-larger", 2]]) $(selector).addEventListener("click", () => {
    state.font = Math.max(20, Math.min(34, state.font + delta)); applyFont();
    try { readingStorage.setItem("aden-reading-font-v1", state.font); } catch {}
  });
  $("#export-records").addEventListener("click", exportRecords);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopTimer(); else startTimer(); });
  window.addEventListener("pagehide", stopTimer);
  window.addEventListener("pageshow", startTimer);
  document.addEventListener("keydown", (event) => {
    if (state.view !== "reader" || event.target.closest("button, input, select, a")) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); openPassage(state.index - 1); }
    if (event.key === "ArrowRight") { event.preventDefault(); openPassage(state.index + 1); }
  });
  setInterval(() => {
    if (state.runStart !== null && canTime()) flushTime(Date.now(), Date.now() - state.lastSaved >= 5000);
    renderTimer(); renderStats();
  }, 1000);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((error) => console.warn("离线缓存不可用", error));
}
init().catch((error) => {
  console.error(error);
  $("#app-status").textContent = "暂时无法加载阅读材料，请联网后刷新页面重试。";
});
