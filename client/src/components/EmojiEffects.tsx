import { useEffect, useMemo, useState } from "react";

// One overlay, mounted once, that plays short screen effects in response to
// "echo:effect" window events. Pointer-events are off so it never blocks the UI.
const DURATIONS = { confetti: 2800, rocket: 2400, hearts: 3000, fire: 2900 };
let _id = 0;

export default function EmojiEffects() {
  const [effects, setEffects] = useState([]); // [{ id, type }]

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    function onEffect(e) {
      const type = e.detail?.type;
      if (reduce || !type || !DURATIONS[type]) return;
      const id = ++_id;
      setEffects((list) => [...list, { id, type }]);
      setTimeout(() => setEffects((list) => list.filter((x) => x.id !== id)), DURATIONS[type]);
    }
    window.addEventListener("echo:effect", onEffect);
    return () => window.removeEventListener("echo:effect", onEffect);
  }, []);

  if (effects.length === 0) return null;
  return (
    <div className="fx-layer" aria-hidden="true">
      {effects.map((fx) => (
        <Effect key={fx.id} type={fx.type} />
      ))}
    </div>
  );
}

function Effect({ type }) {
  if (type === "confetti") return <Confetti />;
  if (type === "rocket") return <Rocket />;
  if (type === "hearts") return <Hearts />;
  if (type === "fire") return <Fire />;
  return null;
}

// A livelier flames effect: flames that climb and flicker, embers drifting up,
// and a pulsing heat glow along the bottom edge.
function Fire() {
  const flames = useMemo(
    () =>
      Array.from({ length: 20 }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        dur: 1.7 + Math.random() * 1.1,
        size: 30 + Math.random() * 34,
        flick: 0.16 + Math.random() * 0.22,
      })),
    []
  );
  const embers = useMemo(
    () =>
      Array.from({ length: 28 }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.1,
        dur: 1.3 + Math.random() * 1.5,
        size: 3 + Math.random() * 5,
        drift: (Math.random() * 140 - 70).toFixed(0),
      })),
    []
  );
  return (
    <div className="fx-fire">
      <div className="fire-glow" />
      {flames.map((f, i) => (
        <span
          key={i}
          className="flame-rise"
          style={{ left: `${f.left}%`, animationDelay: `${f.delay}s`, animationDuration: `${f.dur}s` }}
        >
          <span className="flame-flicker" style={{ fontSize: `${f.size}px`, animationDuration: `${f.flick}s` }}>
            🔥
          </span>
        </span>
      ))}
      {embers.map((e, i) => (
        <span
          key={`e${i}`}
          className="ember"
          style={{
            left: `${e.left}%`,
            width: `${e.size}px`,
            height: `${e.size}px`,
            "--drift": `${e.drift}px`,
            animationDelay: `${e.delay}s`,
            animationDuration: `${e.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

const CONFETTI_COLORS = ["#f43f5e", "#fbbf24", "#34d399", "#3b82f6", "#a855f7", "#fb7185", "#22d3ee"];
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.35,
        dur: 1.8 + Math.random() * 1.3,
        rot: (Math.random() * 720 - 360).toFixed(0),
        drift: (Math.random() * 280 - 140).toFixed(0),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        w: 6 + Math.random() * 6,
        h: 9 + Math.random() * 8,
      })),
    []
  );
  return (
    <div className="fx-confetti">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            width: `${p.w}px`,
            height: `${p.h}px`,
            "--drift": `${p.drift}px`,
            "--rot": `${p.rot}deg`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

// Rocket with a dissipating exhaust trail of smoke puffs that follow its path.
function Rocket() {
  const puffs = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        delay: 0.05 + i * 0.04,
        size: 10 + Math.random() * 14,
        jitter: (Math.random() * 24 - 12).toFixed(0),
      })),
    []
  );
  return (
    <div className="fx-rocket-wrap">
      {puffs.map((p, i) => (
        <span
          key={i}
          className="rocket-puff"
          style={{
            width: `${p.size}px`,
            height: `${p.size}px`,
            "--jitter": `${p.jitter}px`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
      <span className="fx-rocket" role="img" aria-label="rocket">
        🚀
      </span>
    </div>
  );
}

const HEART_GLYPHS = ["❤️", "💖", "💕", "💗", "💞", "🥰"];
// Hearts that float up (with a little drift) while beating like a pulse.
function Hearts() {
  const items = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.7,
        dur: 2.0 + Math.random() * 1.4,
        size: 22 + Math.random() * 26,
        drift: (Math.random() * 130 - 65).toFixed(0),
        beat: 0.5 + Math.random() * 0.3,
        emoji: HEART_GLYPHS[i % HEART_GLYPHS.length],
      })),
    []
  );
  return (
    <div className="fx-hearts">
      {items.map((h, i) => (
        <span
          key={i}
          className="heart-rise"
          style={{
            left: `${h.left}%`,
            "--drift": `${h.drift}px`,
            animationDelay: `${h.delay}s`,
            animationDuration: `${h.dur}s`,
          }}
        >
          <span className="heart-beat" style={{ fontSize: `${h.size}px`, animationDuration: `${h.beat}s` }}>
            {h.emoji}
          </span>
        </span>
      ))}
    </div>
  );
}
