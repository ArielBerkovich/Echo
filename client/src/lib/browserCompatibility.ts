import Bowser from "bowser";

export const MIN_CHROMIUM_MAJOR = 111;

const CHROMIUM_ENGINE_PATTERN = /(?:Chromium|HeadlessChrome|Chrome)\/(\d+)/i;
const CHROMIUM_BROWSERS = new Set([
  "Chrome",
  "Chromium",
  "Microsoft Edge",
  "Opera",
  "Vivaldi",
  "Samsung Internet for Android",
  "Brave",
  "Yandex",
]);

type NavigatorWithClientHints = Navigator & { userAgentData?: Bowser.ClientHints };

export type ChromiumBrowser = { name: string; major: number };

export function detectChromiumBrowser(
  userAgent: string,
  clientHints?: Bowser.ClientHints,
): ChromiumBrowser | null {
  // iOS browsers expose Chromium-like product tokens but all use WebKit.
  if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent)) return null;

  const parser = Bowser.getParser(userAgent, clientHints);
  const { name, version } = parser.getBrowser();
  if (!CHROMIUM_BROWSERS.has(name)) return null;

  const versionString = parser.getBrandVersion("Chromium")
    ?? userAgent.match(CHROMIUM_ENGINE_PATTERN)?.[1]
    ?? version?.split(".")[0];
  const major = Number.parseInt(versionString ?? "", 10);
  return Number.isFinite(major) ? { name, major } : null;
}

export function detectCurrentChromiumBrowser() {
  const { userAgent, userAgentData } = navigator as NavigatorWithClientHints;
  return detectChromiumBrowser(userAgent, userAgentData);
}
