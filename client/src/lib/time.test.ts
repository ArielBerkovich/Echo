import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDate, formatDateTime, formatDayDivider, formatTime, isDifferentDay, relativeTime } from "./time.js";

describe("time formatting helpers", () => {
  it("return empty strings for invalid dates where helpers explicitly guard", () => {
    assert.equal(formatDayDivider("not-a-date"), "");
    assert.equal(relativeTime("not-a-date"), "");
  });

  it("formats valid dates without throwing", () => {
    assert.notEqual(formatTime("2026-06-04T12:34:00Z"), "");
    assert.match(formatDateTime("2026-06-04T12:34:00Z"), /Jun|06|4/);
    assert.match(formatDate("2026-06-04T12:34:00Z"), /2026/);
  });

  it("detects calendar-day boundaries", () => {
    assert.equal(isDifferentDay("2026-06-04T09:00:00", "2026-06-04T17:00:00"), false);
    assert.equal(isDifferentDay("2026-06-04T09:00:00", "2026-06-05T09:00:00"), true);
  });

  it("labels today and yesterday for day dividers", () => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    assert.equal(formatDayDivider(today.toISOString()), "Today");
    assert.equal(formatDayDivider(yesterday.toISOString()), "Yesterday");
  });

  it("produces recency-aware relative labels", () => {
    assert.equal(relativeTime(new Date(Date.now() - 30 * 1000).toISOString()), "now");
    assert.equal(relativeTime(new Date(Date.now() - 5 * 60 * 1000).toISOString()), "5 min");
    assert.equal(relativeTime(new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()), "Yesterday");
  });
});
