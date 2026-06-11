import { useMemo } from "react";
import { createRenderer } from "../markdown.js";

export function useMarkdownRenderer(users = [], username, customEmojis = []) {
  const knownUsernames = useMemo(
    () => new Set(users.map((u) => u.username.toLowerCase())),
    [users]
  );
  return useMemo(
    () => createRenderer(knownUsernames, username, customEmojis),
    [knownUsernames, username, customEmojis]
  );
}
