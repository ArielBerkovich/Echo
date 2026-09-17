let worker;
let nextRequestId = 0;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./autocorrect.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      const resolve = pending.get(data.id);
      if (!resolve) return;
      pending.delete(data.id);
      resolve(data.suggestions || []);
    };
  }
  return worker;
}

function matchCase(word, suggestion) {
  if (word.toUpperCase() === word) return suggestion.toUpperCase();
  if (word[0]?.toUpperCase() === word[0]) return `${suggestion[0].toUpperCase()}${suggestion.slice(1)}`;
  return suggestion;
}

export function suggestCorrection(word) {
  if (!/^[A-Za-z][A-Za-z'-]{2,}$/.test(word)) return Promise.resolve(null);
  const id = ++nextRequestId;
  return new Promise((resolve) => {
    pending.set(id, (suggestions) => {
      const suggestion = suggestions.find((candidate) => candidate.toLowerCase() !== word.toLowerCase());
      resolve(suggestion ? matchCase(word, suggestion) : null);
    });
    getWorker().postMessage({ id, word });
  });
}
