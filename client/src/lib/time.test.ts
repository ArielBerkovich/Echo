import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDate, formatDateTime, formatDayDivider, formatThreadDate, formatTime, isDifferentDay, isSameMinute, relativeTime } from "./time.js";

describe("time formatting helpers", () => {
  it("return empty strings for invalid dates where helpers explicitly guard", () => {
    assert.equal(formatDayDivider("not-a-date"), "");
    assert.equal(relativeTime("not-a-date"), "");
  });

  it("formats valid dates without throwing", () => {
    const evening = new Date(2026, 5, 4, 21, 34).toISOString();
    assert.equal(formatTime(evening), "21:34");
    assert.match(formatDateTime(evening), /Jun 4, 21:34/);
    assert.match(formatDate(evening), /2026/);
  });

  it("detects calendar-day boundaries", () => {
    assert.equal(isDifferentDay("2026-06-04T09:00:00", "2026-06-04T17:00:00"), false);
    assert.equal(isDifferentDay("2026-06-04T09:00:00", "2026-06-05T09:00:00"), true);
  });

  it("detects timestamps in the same local minute", () => {
    assert.equal(isSameMinute("2026-06-04T09:00:01", "2026-06-04T09:00:59"), true);
    assert.equal(isSameMinute("2026-06-04T09:00:59", "2026-06-04T09:01:00"), false);
    assert.equal(isSameMinute("invalid", "2026-06-04T09:00:00"), false);
  });

  it("labels today and yesterday for day dividers", () => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    assert.equal(formatDayDivider(today.toISOString()), "Today");
    assert.equal(formatDayDivider(yesterday.toISOString()), "Yesterday");
  });

  it("labels thread messages with today, yesterday, recent weekdays, or dates", () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const recent = new Date(today);
    recent.setDate(today.getDate() - 3);
    const older = new Date(today);
    older.setDate(today.getDate() - 10);

    assert.equal(formatThreadDate(today.toISOString()), "Today");
    assert.equal(formatThreadDate(yesterday.toISOString()), "Yesterday");
    assert.equal(formatThreadDate(recent.toISOString()), recent.toLocaleDateString([], { weekday: "long" }));
    assert.equal(formatThreadDate(older.toISOString()), older.toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" }));
  });

  it("produces recency-aware relative labels", () => {
    assert.equal(relativeTime(new Date(Date.now() - 30 * 1000).toISOString()), "now");
    assert.equal(relativeTime(new Date(Date.now() - 5 * 60 * 1000).toISOString()), "5 min");
    assert.equal(relativeTime(new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()), "Yesterday");
  });
});
