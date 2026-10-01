/* Reading history is independent of vocabulary progress. Durations are milliseconds. */
(function (root) {
  "use strict";
  const key = "aden-reading-progress-v1";
  const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  function empty() { return { version: 1, days: {}, lastRead: {} }; }
  function load(storage) {
    try {
      const value = JSON.parse(storage.getItem(key));
      if (!value || value.version !== 1 || !value.days || typeof value.days !== "object" || Array.isArray(value.days)) return empty();
      const result = empty();
      result.lastRead = value.lastRead && typeof value.lastRead === "object" ? value.lastRead : {};
      for (const [date, day] of Object.entries(value.days)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day || typeof day.documents !== "object" || !day.documents) continue;
        const documents = {};
        for (const [id, doc] of Object.entries(day.documents)) {
          if (!doc || !Number.isFinite(doc.ms) || doc.ms <= 0 || !doc.passages || typeof doc.passages !== "object") continue;
          const passages = Object.fromEntries(Object.entries(doc.passages).filter(([, ms]) => Number.isFinite(ms) && ms > 0));
          documents[id] = { ms: doc.ms, passages };
        }
        if (Object.keys(documents).length) result.days[date] = { documents, totalMs: Object.values(documents).reduce((sum, doc) => sum + doc.ms, 0) };
      }
      return result;
    } catch { return empty(); }
  }
  function addInterval(progress, docId, passageId, start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !docId || !passageId) return;
    let cursor = start;
    while (cursor < end) {
      const date = new Date(cursor);
      const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
      const next = Math.min(end, midnight);
      const elapsed = next - cursor;
      const day = progress.days[dateKey(date)] ||= { totalMs: 0, documents: {} };
      const doc = day.documents[docId] ||= { ms: 0, passages: {} };
      day.totalMs += elapsed;
      doc.ms += elapsed;
      doc.passages[passageId] = (doc.passages[passageId] || 0) + elapsed;
      cursor = next;
    }
  }
  function duration(ms) {
    const seconds = Math.floor(Math.max(0, ms || 0) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? `${hours} 小时 ${minutes} 分 ${seconds % 60} 秒` : `${minutes} 分 ${seconds % 60} 秒`;
  }
  function clock(ms) {
    const seconds = Math.floor(Math.max(0, ms || 0) / 1000);
    const pad = (value) => String(value).padStart(2, "0");
    return seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds % 3600 / 60))}:${pad(seconds % 60)}` : `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
  }
  root.ReadingProgress = { key, dateKey, empty, load, addInterval, duration, clock };
})(typeof window === "undefined" ? globalThis : window);
