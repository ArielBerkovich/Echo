import { useLayoutEffect, useState } from "react";

// A lightweight first-run guided tour. Each step optionally spotlights a UI
// element (dimming everything else) and shows a tooltip card beside it; steps
// without a target render a centered card. No external dependencies.
const STEPS = [
  {
    title: "Welcome to Echo 👋",
    body: "Here's a quick 30-second tour of the essentials. You can skip it anytime.",
    target: null,
  },
  {
    title: "Get around",
    body: "Switch between Home, Direct Messages, and Activity from this rail.",
    target: ".rail",
    placement: "right",
  },
  {
    title: "Channels & DMs",
    body: "Your channels and conversations live here — click any one to open it.",
    target: ".channel-list",
    placement: "right",
  },
  {
    title: "Search everything",
    body: "Find messages, people, and channels. Power-filter with in:channel, from:@user, and has:file — then press Enter.",
    target: ".pane-search",
    placement: "bottom",
  },
  {
    title: "Send a message",
    body: "Write here and format with the toolbar. Press Enter to send, Shift+Enter for a new line.",
    target: ".composer",
    placement: "top",
  },
  {
    title: "Your account & password",
    body: "Open Settings here to edit your profile or change your password. Forget your password and can't sign in? Your workspace admin can issue you a one-time password to set a new one.",
    target: ".sidebar-footer",
    placement: "right",
  },
  {
    title: "You're all set! 🎉",
    body: "Head to #general to say hello. You can replay this tour anytime from Settings.",
    target: null,
  },
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

export default function Walkthrough({ onClose }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  useLayoutEffect(() => {
    function measure() {
      const el = step.target && document.querySelector(step.target);
      if (!el) return setRect(null);
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

  function next() {
    if (last) onClose();
    else setI((n) => n + 1);
  }

  return (
    <div className={`wt-overlay ${rect ? "" : "wt-dim"}`}>
      {rect && (
        <div
          className="wt-spotlight"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      <div className="wt-card" style={cardStyle(rect, step.placement)}>
        <div className="wt-step">
          {i + 1} of {STEPS.length}
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="wt-actions">
          <button type="button" className="wt-skip" onClick={onClose}>
            {last ? "" : "Skip tour"}
          </button>
          <div className="wt-nav">
            {i > 0 && (
              <button type="button" className="btn-secondary" onClick={() => setI((n) => n - 1)}>
                Back
              </button>
            )}
            <button type="button" className="btn-primary" onClick={next}>
              {last ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
