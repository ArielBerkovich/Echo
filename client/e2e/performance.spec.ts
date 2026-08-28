import { expect, test } from "@playwright/test";
import { channelRow, composer, messageByText, requestAsToken, seedWorkspaceFixture } from "./helpers.js";

type BrowserPerformance = {
  navigation: Record<string, number>;
  longTasks: number[];
  frameSamples: number[];
  messageCount: number;
};

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

test.describe("performance measurements", () => {
  test("measures app load, channel open, rendering, scrolling, and live delivery", async ({ page }) => {
    const fixture = await seedWorkspaceFixture(page);
    const longTasks: number[] = [];
    await page.addInitScript(() => {
      (window as any).__echoPerf = { longTasks: [], frameSamples: [] };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) (window as any).__echoPerf.longTasks.push(entry.duration);
      }).observe({ type: "longtask", buffered: true });
    });

    const navigationStart = Date.now();
    await page.goto(`/channels/${fixture.projectChannel.name}`);
    await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);
    await expect(composer(page)).toBeVisible();
    const channelOpenMs = Date.now() - navigationStart;

    const messageBody = `perf browser message ${fixture.suffix}`;
    const sendStart = Date.now();
    await composer(page).fill(messageBody);
    await page.getByTestId("composer-send").click();
    await expect(messageByText(page, messageBody)).toHaveCount(1);
    const messageDeliveryMs = Date.now() - sendStart;

    const frameSamples = await page.evaluate(async () => {
      const samples: number[] = [];
      let previous = performance.now();
      const deadline = previous + 1500;
      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          samples.push(now - previous);
          previous = now;
          if (now < deadline) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      return samples;
    });

    const scrollStart = Date.now();
    const messages = page.getByTestId("messages");
    await messages.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.waitForTimeout(500);
    const scrollMs = Date.now() - scrollStart;

    const navigation = await page.evaluate(() => {
      const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      return {
        ttfb: entry.responseStart,
        domContentLoaded: entry.domContentLoadedEventEnd,
        loadEvent: entry.loadEventEnd,
      };
    });
    const browser: BrowserPerformance = {
      navigation,
      longTasks: await page.evaluate(() => (window as any).__echoPerf?.longTasks || []),
      frameSamples,
      messageCount: await messages.getByTestId(/^message-/).count(),
    };
    longTasks.push(...browser.longTasks);

    const result = {
      navigation,
      channelOpenMs,
      messageDeliveryMs,
      scrollMs,
      messageCount: browser.messageCount,
      longTaskCount: longTasks.length,
      maxLongTaskMs: Math.max(0, ...longTasks),
      frameP95Ms: Math.round(percentile(frameSamples, 95) * 100) / 100,
      framesOver50Ms: frameSamples.filter((ms) => ms > 50).length,
    };
    console.log("BROWSER_PERFORMANCE_RESULT", JSON.stringify(result));

    expect(result.messageCount).toBeGreaterThan(0);
    expect(result.framesOver50Ms).toBeLessThan(5);
    if (process.env.PERF_ENFORCE === "1") {
      expect(result.channelOpenMs).toBeLessThan(Number(process.env.PERF_CHANNEL_OPEN_MS || 1500));
      expect(result.messageDeliveryMs).toBeLessThan(Number(process.env.PERF_MESSAGE_DELIVERY_MS || 1000));
      expect(result.maxLongTaskMs).toBeLessThan(Number(process.env.PERF_MAX_LONG_TASK_MS || 200));
    }
  });

  test("measures warm Activity to Home transitions", async ({ page }) => {
    if (process.env.PERF_DISABLE_VIRTUALIZATION === "1") {
      await page.addInitScript(() => {
        (window as any).__echoDisableVirtualization = true;
      });
    }
    if (process.env.PERF_CPU_RATE) {
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.PERF_CPU_RATE) });
    }
    const fixture = await seedWorkspaceFixture(page);
    const extraMessages = Number(process.env.PERF_LONG_MESSAGES || 0);
    if (extraMessages > 0) {
      await Promise.all(Array.from({ length: extraMessages }, (_, index) =>
        requestAsToken(page, fixture.alice.token, "/messages/upsert", {
          method: "POST",
          body: {
            channelId: fixture.projectChannel.id,
            body: `virtualization benchmark ${index}`,
          },
        })
      ));
    }
    await page.goto(`/channels/${fixture.projectChannel.name}`);
    await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);
    await expect(page.getByTestId("messages")).toBeVisible();
    await page.evaluate(() => {
      (window as any).__transitionLongTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) (window as any).__transitionLongTasks.push(entry.duration);
      }).observe({ type: "longtask" });
    });

    const transitions: number[] = [];
    const longTasks: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      await page.getByTestId("rail-activity").click();
      await expect(page.getByTestId("activity-header")).toBeVisible();

      const rendered = await page.evaluate(() => new Promise((resolve) => {
        const start = performance.now();
        (document.querySelector('[data-testid="rail-home"]') as HTMLElement).click();
        requestAnimationFrame(() => resolve({
          elapsed: performance.now() - start,
          longTasks: (window as any).__transitionLongTasks.splice(0),
        }));
      }));
      transitions.push(rendered.elapsed);
      longTasks.push(...rendered.longTasks);
    }

    const sorted = [...transitions].sort((a, b) => a - b);
    const result = {
      runs: transitions,
      medianMs: Math.round(sorted[Math.floor(sorted.length / 2)] * 100) / 100,
      p95Ms: Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] * 100) / 100,
      minMs: Math.round(sorted[0] * 100) / 100,
      maxMs: Math.round(sorted[sorted.length - 1] * 100) / 100,
      maxLongTaskMs: Math.round(Math.max(0, ...longTasks) * 100) / 100,
      longTaskCount: longTasks.length,
    };
    console.log("ACTIVITY_HOME_PERFORMANCE_RESULT", JSON.stringify(result));
  });
});
