import { useEffect, useLayoutEffect, useState } from "react";
import { useI18n } from "../lib/i18n.js";
import { languageDirection } from "../lib/languages.js";

// A lightweight first-run guided tour. Each step optionally spotlights a UI
// element (dimming everything else) and shows a tooltip card beside it; steps
// without a target render a centered card. No external dependencies.
const STEPS = [
  {
    title: "Welcome to Echo 👋",
    body: "Here's a quick tour of the essentials. You can skip it anytime.",
    target: null,
  },
  {
    title: "Get around",
    body: "Use the rail to move between Home, Direct Messages, Activity, and Saved. Open More for channels, user groups, and other workspace options.",
    target: ".rail-top",
    placement: "right",
  },
  {
    title: "Your sidebar",
    body: "Your joined channels and recent direct messages live here. Select any conversation to open it.",
    target: ".sidebar",
    placement: "right",
  },
  {
    title: "More workspace options",
    body: "Open More in the rail to browse public channels or user groups, then return to the rail whenever you need those workspace views.",
    target: '[data-testid="sidebar-more"]',
    placement: "right",
  },
  {
    title: "Create a channel",
    body: "Use the create button at the top of the sidebar to make a new public or private channel.",
    target: '[data-testid="create-channel"]',
    placement: "right",
  },
  {
    title: "Start a DM",
    body: "Use the compose button at the top of the sidebar to find someone and start a new direct message.",
    target: '[data-testid="start-dm"]',
    placement: "right",
  },
  {
    title: "Search everything",
    body: "Find messages, people, and channels. Power-filter with in:channel, from:@user, and has:file — then press Enter.",
    target: '[data-testid="search-input"]',
    placement: "bottom",
  },
  {
    title: "Open quick actions",
    body: "Use the sparkles button to open common actions, or press Ctrl K to open the action switcher from your keyboard.",
    target: ".workspace-search-actions",
    placement: "below",
  },
  {
    title: "Conversation tools",
    body: "Use the conversation header to find files, search within the conversation, view members, and manage pinned messages.",
    target: ".channel-header",
    placement: "bottom",
  },
  {
    title: "Send a message",
    body: "Write here and press Enter to send. Use Shift+Enter for a new line, or open the formatting controls for richer messages.",
    target: ".composer",
    placement: "top",
  },
  {
    title: "Format your message",
    body: "Add links, lists, quotes, inline code, code blocks, and other formatting without leaving the composer.",
    target: '[data-testid="composer-formatting"]',
    placement: "top",
  },
  {
    title: "Mention people and channels",
    body: "Type @ to find people or groups, and # to find public channels. Suggestions follow your cursor as you type.",
    target: ".composer",
    placement: "top",
  },
  {
    title: "More message tools",
    body: "Open the plus menu to attach files, create a survey, or start a retrospective board.",
    target: '[data-testid="composer-more-actions"]',
    placement: "top",
  },
  {
    title: "Schedule a message",
    body: "Use the clock beside Send to schedule a message and manage messages that are waiting to be sent.",
    target: '[data-testid="composer-send-options"]',
    placement: "top",
  },
  {
    title: "Keep conversations organized",
    body: "React, reply in a thread, forward, save, or open message actions from the conversation.",
    target: ".messages-shell",
    placement: "left",
  },
  {
    title: "Your account & settings",
    body: "Use your account controls to update your profile, open Settings, switch themes, or sign out. Settings also includes your password and keyboard shortcuts.",
    target: ".rail-account",
    placement: "right",
  },
  {
    title: "You're all set! 🎉",
    body: "Head to #general to say hello. You're ready to get started.",
    target: null,
  },
];

const HEBREW_STEPS = [
  ["ברוכים הבאים ל־Echo 👋", "זהו סיור קצר בדברים החשובים. אפשר לדלג בכל שלב."],
  ["התמצאות", "השתמשו בסרגל הניווט כדי לעבור בין בית, הודעות ישירות, פעילות ושמורים. פתחו אפשרויות נוספות לערוצים, קבוצות ואפשרויות סביבת עבודה נוספות."],
  ["הסרגל הצדדי", "כאן נמצאים הערוצים שהצטרפתם אליהם וההודעות הישירות האחרונות. בחרו שיחה כדי לפתוח אותה."],
  ["אפשרויות נוספות", "פתחו את האפשרויות הנוספות בסרגל הניווט כדי לעיין בערוצים ציבוריים או בקבוצות משתמשים."],
  ["יצירת ערוץ", "השתמשו בכפתור היצירה בראש הסרגל הצדדי כדי ליצור ערוץ ציבורי או פרטי."],
  ["התחלת הודעה ישירה", "השתמשו בכפתור הכתיבה בראש הסרגל הצדדי כדי למצוא אדם ולהתחיל הודעה ישירה חדשה."],
  ["חיפוש בכל מקום", "חפשו הודעות, אנשים וערוצים. אפשר לסנן באמצעות in:channel, ‏from:@user ו־has:file ואז ללחוץ Enter."],
  ["פתיחת פעולות מהירות", "לחצו על כפתור הניצוצות כדי לפתוח פעולות נפוצות, או הקישו על Ctrl+K כדי לפתוח את תפריט הפעולות."],
  ["כלי שיחה", "השתמשו בכותרת השיחה כדי למצוא קבצים, לחפש בתוך השיחה, לצפות בחברים ולנהל הודעות נעוצות."],
  ["שליחת הודעה", "כתבו כאן ולחצו Enter כדי לשלוח. השתמשו ב־Shift+Enter לשורה חדשה, או פתחו את כלי העיצוב."],
  ["עיצוב הודעה", "אפשר להוסיף קישורים, רשימות, ציטוטים, קוד מוטבע, בלוקי קוד ועיצוב נוסף בלי לצאת משדה הכתיבה."],
  ["אזכור אנשים וערוצים", "הקלידו @ כדי למצוא אנשים או קבוצות, ו־# כדי למצוא ערוצים ציבוריים. ההצעות יופיעו ליד הסמן."],
  ["כלי הודעה נוספים", "פתחו את תפריט הפלוס כדי לצרף קבצים, ליצור סקר או להתחיל לוח רטרוספקטיבה."],
  ["תזמון הודעה", "השתמשו בשעון שליד שליחה כדי לתזמן הודעה ולנהל הודעות שממתינות לשליחה."],
  ["שמירה על סדר בשיחות", "אפשר להגיב, לענות בשרשור, להעביר, לשמור או לפתוח פעולות הודעה מתוך השיחה."],
  ["החשבון וההגדרות שלכם", "השתמשו בפקדי החשבון כדי לעדכן את הפרופיל, לפתוח הגדרות, להחליף ערכת צבעים או לצאת."],
  ["הכול מוכן! 🎉", "עברו אל #general כדי לומר שלום. אפשר להתחיל."],
];

const CARD_W = 340;
const GAP = 14;
const CARD_PAD = 24;

// Is a rect usable as a spotlight target (on-screen and non-trivial)?
function onScreen(r) {
  const vw = window.innerWidth, vh = window.innerHeight;
  return r.width > 4 && r.height > 4 && r.right > 40 && r.bottom > 40 && r.left < vw - 40 && r.top < vh - 40;
}

function cardStyle(rect, placement) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const width = Math.min(CARD_W, vw - CARD_PAD);
  if (!rect) {
    return {
      left: Math.max(12, (vw - width) / 2),
      top: Math.max(24, vh / 2 - 110),
      width,
      maxHeight: vh - CARD_PAD,
    };
  }
  let left, top, bottom;
  if (placement === "right") {
    left = rect.left + rect.width + GAP;
    top = rect.top;
  } else if (placement === "left") {
    left = rect.left - CARD_W - GAP;
    top = rect.top;
  } else if (placement === "top") {
    left = rect.left;
    bottom = vh - rect.top + GAP;
  } else {
    left = rect.left;
    top = rect.top + rect.height + GAP;
  }
  left = Math.max(12, Math.min(left, vw - width - 12));
  const style = { left, width, maxHeight: vh - CARD_PAD };
  if (bottom != null) style.bottom = Math.max(12, Math.min(bottom, vh - 120));
  else style.top = Math.max(12, Math.min(top, vh - 210));
  return style;
}

function spotlightStyle(rect) {
  const top = Math.max(2, rect.top - 6);
  const left = Math.max(2, rect.left - 6);
  return {
    top,
    left,
    width: Math.max(0, Math.min(rect.width + 12, window.innerWidth - left - 2)),
    height: Math.max(0, Math.min(rect.height + 12, window.innerHeight - top - 2)),
  };
}

export default function Walkthrough({ onClose }) {
  const { language, t } = useI18n();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const englishStep = STEPS[i];
  const [title, body] = language === "he" ? HEBREW_STEPS[i] : [englishStep.title, englishStep.body];
  const isRtl = languageDirection(language) === "rtl";
  const step = {
    ...englishStep,
    title,
    body,
    placement: isRtl && englishStep.placement === "right"
      ? "left"
      : isRtl && englishStep.placement === "left"
        ? "right"
        : englishStep.placement,
  };
  const last = i === STEPS.length - 1;

  useLayoutEffect(() => {
    function measure() {
      const el = step.target && document.querySelector(step.target);
      if (!el) return setRect(null);
      if (el instanceof HTMLElement && el.matches("button, input, textarea, select, [contenteditable='true']")) {
        el.focus();
      }
      const r = el.getBoundingClientRect();
      setRect(
        onScreen(r) ? { top: r.top, left: r.left, width: r.width, height: r.height } : null
      );
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [i, step.target]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (last) onClose();
      else setI((n) => n + 1);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [last, onClose]);

  function next() {
    if (last) onClose();
    else setI((n) => n + 1);
  }

  return (
    <div className={`wt-overlay ${rect ? "" : "wt-dim"}`}>
      {rect && (
        <div
          className="wt-spotlight"
          style={spotlightStyle(rect)}
        />
      )}
      <div className="wt-card" style={cardStyle(rect, step.placement)}>
        <div className="wt-step">
          {i + 1} {t("stepOf")} {STEPS.length}
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="wt-actions">
          <button type="button" className="wt-skip" onClick={onClose}>
            {last ? "" : t("skipTour")}
          </button>
          <div className="wt-nav">
            {i > 0 && (
              <button type="button" className="btn-secondary" onClick={() => setI((n) => n - 1)}>
                {t("back")}
              </button>
            )}
            <button type="button" className="btn-primary" onClick={next}>
              {last ? t("finish") : t("next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
