import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { queryKeys } from "./queryClient.js";

// Clip against every scroll container as well as the viewport. Using the
// available viewport height lets very tall messages qualify too.
export function isActivitySourceVisible(node) {
  if (!node.isConnected || document.visibilityState !== "visible") return false;
  const rect = node.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  let left = 0, top = 0, right = window.innerWidth, bottom = window.innerHeight;
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") return false;
    const box = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
      left = Math.max(left, box.left); right = Math.min(right, box.right);
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom);
    }
  }
  const visibleLeft = Math.max(left, rect.left), visibleRight = Math.min(right, rect.right);
  const visibleTop = Math.max(top, rect.top), visibleBottom = Math.min(bottom, rect.bottom);
  if (visibleRight - visibleLeft < Math.min(rect.width, right - left) * 0.5 ||
      visibleBottom - visibleTop < Math.min(rect.height, bottom - top) * 0.5 ||
      visibleRight <= visibleLeft || visibleBottom <= visibleTop) return false;
  const foreground = document.elementFromPoint((visibleLeft + visibleRight) / 2, (visibleTop + visibleBottom) / 2);
  return !!foreground && node.contains(foreground);
}

export function useActivityReads(userId, items) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const unread = items.filter((item) => item.unread);
    if (!userId || !unread.length) return;
    const byMessage = new Map();
    const notices = new Map();
    for (const item of unread) {
      if (item.messageId) {
        const group = byMessage.get(item.messageId) || [];
        group.push(item);
        byMessage.set(item.messageId, group);
      } else notices.set(item.id, [item]);
    }
    let candidates = [];
    const refreshCandidates = () => {
      candidates = [...document.querySelectorAll(
        '[data-testid="messages"] [data-mid], [data-testid="thread-body"] [data-mid], [data-activity-notice-id]'
      )].flatMap((node) => {
        const related = node.hasAttribute("data-mid")
          ? byMessage.get(node.getAttribute("data-mid"))
          : notices.get(node.getAttribute("data-activity-notice-id"));
        return related ? [{ node, related }] : [];
      });
    };
    refreshCandidates();
    const observer = new MutationObserver(refreshCandidates);
    observer.observe(document.body, { childList: true, subtree: true });
    const visibleSince = new Map();
    const completed = new Set();
    let pending = false;
    let stopped = false;
    let retryAt = 0;
    const resetVisibility = () => visibleSince.clear();
    document.addEventListener("visibilitychange", resetVisibility);
    const timer = window.setInterval(async () => {
      const now = performance.now();
      const visible = new Map();
      for (const { node, related } of candidates) {
        if (isActivitySourceVisible(node)) {
          for (const item of related) if (!completed.has(item.id)) visible.set(item.id, item);
        }
      }
      for (const id of visibleSince.keys()) if (!visible.has(id)) visibleSince.delete(id);
      const ready = [];
      for (const [id, item] of visible) {
        if (!visibleSince.has(id)) visibleSince.set(id, now);
        if (now - visibleSince.get(id) >= 500) ready.push({ id, createdAt: item.createdAt });
      }
      if (pending || now < retryAt || !ready.length) return;
      pending = true;
      try {
        await api.markActivityRead(ready);
        for (const item of ready) completed.add(item.id);
        if (!stopped) await queryClient.invalidateQueries({ queryKey: queryKeys.activity });
      } catch {
        retryAt = performance.now() + 2000;
      } finally {
        pending = false;
      }
    }, 150);
    return () => {
      stopped = true;
      clearInterval(timer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", resetVisibility);
    };
  }, [userId, items, queryClient]);
}
