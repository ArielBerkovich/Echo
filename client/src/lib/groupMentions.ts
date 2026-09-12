function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const GROUP_ICON = `<svg class="mention-group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

export function displayGroupMentions(body, groups = []) {
  let output = String(body || "");
  for (const group of groups) {
    const id = String(group.id || "");
    if (!id) continue;
    const provider = String(group.provider || "rhsso");
    output = output.replace(new RegExp(`@group\\.${escapeRegExp(provider)}\\.${escapeRegExp(id)}\\b`, "g"), `@${group.name}`);
    if (provider === "rhsso") {
      output = output.replace(new RegExp(`@group\\.${escapeRegExp(id)}\\b`, "g"), `@${group.name}`);
    }
  }
  return output;
}

export function decorateGroupMentions(html, groups = []) {
  if (!groups.length || typeof document === "undefined") return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const group of groups) {
    const name = String(group.name || "").trim();
    if (!name) continue;
    const pattern = new RegExp(`@${escapeRegExp(name)}(?![a-zA-Z0-9_.-])`, "g");
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node = walker.nextNode();
    while (node) {
      textNodes.push(node);
      node = walker.nextNode();
    }
    for (const textNode of textNodes) {
      if (textNode.parentElement?.closest("code, pre, a, .mention")) continue;
      const text = textNode.nodeValue || "";
      const matches = [...text.matchAll(pattern)];
      if (!matches.length) continue;
      const fragment = document.createDocumentFragment();
      let last = 0;
      for (const match of matches) {
        if (match.index > last) fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
        const pill = document.createElement("span");
        pill.className = "mention mention--group";
        pill.dataset.groupProvider = String(group.provider || "rhsso");
        pill.dataset.groupId = String(group.id || "");
        pill.setAttribute("aria-label", `${match[0]}, group`);
        pill.innerHTML = `${GROUP_ICON}<span class="mention-group-label"></span>`;
        pill.querySelector(".mention-group-label").textContent = match[0];
        fragment.appendChild(pill);
        last = match.index + match[0].length;
      }
      if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));
      textNode.parentNode.replaceChild(fragment, textNode);
    }
  }
  return template.innerHTML;
}
