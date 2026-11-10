import { rephraseDiff } from "./rephraseDiff.js";
import { markdownTextToComposerHtml } from "../markdownPaste.js";

// Diff the visible text, then decorate sanitized rendered Markdown without
// replacing its formatting elements or interpreting the model output as HTML.
export function rephraseRenderedDiff(before: string, after: string) {
  const create = (text: string) => {
    const container = document.createElement("div");
    container.innerHTML = markdownTextToComposerHtml(text);
    return container;
  };
  const oldContainer = create(before);
  const newContainer = create(after);
  const oldText = oldContainer.textContent || "";
  const newText = newContainer.textContent || "";
  const diff = rephraseDiff(oldText, newText);
  const decorate = (container: HTMLElement, parts: { text: string; changed: boolean }[], tag: "del" | "ins") => {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    let index = 0, offset = 0;
    for (const node of nodes) {
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      while (cursor < node.data.length && index < parts.length) {
        const part = parts[index];
        const count = Math.min(node.data.length - cursor, part.text.length - offset);
        const text = node.data.slice(cursor, cursor + count);
        if (part.changed) {
          const mark = document.createElement(tag);
          mark.textContent = text;
          fragment.appendChild(mark);
        } else fragment.appendChild(document.createTextNode(text));
        cursor += count;
        offset += count;
        if (offset === part.text.length) { index++; offset = 0; }
      }
      node.replaceWith(fragment);
    }
  };
  decorate(oldContainer, diff.before, "del");
  decorate(newContainer, diff.after, "ins");
  return { before: oldContainer.innerHTML, after: newContainer.innerHTML, unchanged: before === after };
}
