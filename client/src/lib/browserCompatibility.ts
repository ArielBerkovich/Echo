import Bowser from "bowser";

export const MIN_CHROMIUM_MAJOR = 111;

const CHROMIUM_ENGINE_PATTERN = /(?:Chromium|HeadlessChrome|Chrome)\/(\d+)/i;
const CHROMIUM_BROWSER_NAMES = new Set([
  "Chrome",
  "Chromium",
  "Microsoft Edge",
  "Opera",
  "Vivaldi",
  "Samsung Internet for Android",
  "Brave",
  "Yandex",
]);

type ClientHints = {
  brands?: Array<{ brand: string; version: string }>;
};

export function detectChromiumBrowser(userAgent: string, clientHints?: ClientHints) {
  // iOS browsers expose Chromium-like product tokens but all use WebKit.
  if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent)) return null;

  const parser = Bowser.getParser(userAgent, clientHints);
  const browser = parser.getBrowser();
  if (!CHROMIUM_BROWSER_NAMES.has(browser.name)) return null;

  const engineVersion = parser.getBrandVersion("Chromium")
    || userAgent.match(CHROMIUM_ENGINE_PATTERN)?.[1]
    || browser.version?.split(".")[0];
  const major = Number.parseInt(engineVersion || "", 10);
  return Number.isFinite(major) ? { name: browser.name, major } : null;
}
