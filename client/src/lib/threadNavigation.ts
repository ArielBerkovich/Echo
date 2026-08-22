export function hasThreadJumpTarget(targetId) {
  return !!targetId;
}

export function scrollThreadMessageIntoView(target, setStickToBottom) {
  if (!target) return false;
  setStickToBottom(false);
  target.scrollIntoView({ block: "start", behavior: "auto" });
  return true;
}
