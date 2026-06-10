import { useEffect, useState } from "react";
import { api } from "../api.js";
import Logo from "./Logo.js";
import { passwordProblem, PASSWORD_RULE } from "../lib/password.js";

// Little postal letters that drift gently around the hero panel — each with its
// own position, size, drift vector and timing for an organic "floating" feel.
const FLOATERS = [
  { t: "envelope", top: "10%", left: "12%", size: 34, dx: "14px", dy: "-18px", rot: "6deg", dur: 20, delay: 0 },
  { t: "note",     top: "18%", left: "63%", size: 24, dx: "-10px", dy: "14px", rot: "-8deg", dur: 23, delay: 2.2 },
  { t: "envelope", top: "70%", left: "20%", size: 30, dx: "10px", dy: "-18px", rot: "5deg", dur: 24, delay: 1.1 },
  { t: "envelope", top: "40%", left: "82%", size: 28, dx: "-14px", dy: "-10px", rot: "-6deg", dur: 21, delay: 4.2 },
  { t: "note",     top: "82%", left: "66%", size: 22, dx: "10px", dy: "12px", rot: "7deg", dur: 25, delay: 3.3 },
  { t: "envelope", top: "31%", left: "31%", size: 26, dx: "-8px", dy: "-18px", rot: "-5deg", dur: 22, delay: 6.1 },
  { t: "note",     top: "52%", left: "48%", size: 20, dx: "12px", dy: "8px", rot: "8deg", dur: 27, delay: 2.7 },
  { t: "envelope", top: "84%", left: "34%", size: 24, dx: "10px", dy: "-14px", rot: "4deg", dur: 23, delay: 1.6 },
];

// Combined login / register screen — split hero + auth form.
export default function Login({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false); // no users yet → create the admin

  const isRegister = mode === "register";

  // First-run: if the workspace has no accounts, show the "create admin" screen.
  useEffect(() => {
    let cancelled = false;
    api
      .setupStatus()
      .then(({ needsSetup }) => {
        if (cancelled || !needsSetup) return;
        setNeedsSetup(true);
        setMode("register");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function switchMode(next) {
    setError(null);
    setMode(next);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    // Enforce a secure password when creating an account (signup or first-run).
    if (isRegister) {
      const weak = passwordProblem(password);
      if (weak) return setError(weak);
    }
    setBusy(true);
    try {
      const payload = isRegister
        ? { username, password, displayName }
        : { username, password };
      const result = isRegister ? await api.register(payload) : await api.login(payload);
      // Play the ripple-burst welcome, then hand off to the app.
      setSuccess(true);
      setTimeout(() => onAuthed(result), 1150);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-bg" aria-hidden="true">
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
        <div className="auth-grid" />
      </div>

      <div className="auth-shell">
        {/* Brand / hero panel */}
        <aside className="auth-hero" aria-hidden="true">
          <div className="auth-letters">
            {FLOATERS.map((f, i) => (
              <span
                key={i}
                className="floatk"
                style={{
                  top: f.top,
                  left: f.left,
                  width: f.size,
                  height: f.size,
                  "--dx": f.dx,
                  "--dy": f.dy,
                  "--rot": f.rot,
                  animationDuration: `${f.dur}s`,
                  animationDelay: `${f.delay}s`,
                }}
              >
                {f.t === "note" ? <NoteIcon /> : <EnvelopeIcon />}
              </span>
            ))}
          </div>
          <div className="auth-hero-mid">
            <div className="auth-logo-wrap">
              <div className="auth-hero-glow" />
              <div className="auth-ripples">
                <span className="auth-ripple" />
                <span className="auth-ripple" />
                <span className="auth-ripple" />
              </div>
              <Logo size={132} />
            </div>
          </div>
        </aside>

        {/* Auth form panel */}
        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-card-head">
            <div className="auth-logo-sm">
              <Logo size={44} />
            </div>
            <h1 className="brand">Echo</h1>
            <p className="auth-card-sub">Sign in to pick up where your conversations left off.</p>
          </div>

          {!needsSetup && (
            <div className="auth-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={!isRegister}
                className={!isRegister ? "active" : ""}
                onClick={() => switchMode("login")}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isRegister}
                className={isRegister ? "active" : ""}
                onClick={() => switchMode("register")}
              >
                Create account
              </button>
              <span className={`auth-tab-ind ${isRegister ? "right" : ""}`} />
            </div>
          )}

          {needsSetup && <div className="setup-badge">🛡 First-time setup</div>}

          <p className="subtitle">
            {needsSetup
              ? "Welcome to Echo! Create the admin account to set up your workspace."
              : isRegister
              ? "Create your account to get started."
              : "Welcome back — sign in to continue."}
          </p>

          {needsSetup && (
            <div className="setup-callout">
              This first account becomes the workspace <strong>admin</strong> — it can issue
              one-time passwords to help others who get locked out.
            </div>
          )}

          <label className="field">
            <span>Username</span>
            <div className="input-wrap">
              <UserIcon />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="your-handle"
                required
              />
            </div>
          </label>

          {isRegister && (
            <label className="field">
              <span>Display name</span>
              <div className="input-wrap">
                <IdIcon />
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How others see you"
                />
              </div>
            </label>
          )}

          <label className="field">
            <span>Password</span>
            <div className="input-wrap">
              <LockIcon />
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? "new-password" : "current-password"}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPw ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {isRegister && <span className="field-hint">{PASSWORD_RULE}</span>}
          </label>

          {error && <div className="error">{error}</div>}

          <button type="submit" className="btn-primary auth-submit" disabled={busy}>
            {busy ? (
              <span className="spinner" />
            ) : needsSetup ? (
              "Create admin account"
            ) : isRegister ? (
              "Create account"
            ) : (
              "Sign in"
            )}
          </button>

          {!needsSetup && (
            <p className="auth-switch">
              {isRegister ? "Already have an account? " : "New to Echo? "}
              <button
                type="button"
                className="link"
                onClick={() => switchMode(isRegister ? "login" : "register")}
              >
                {isRegister ? "Sign in" : "Create one"}
              </button>
            </p>
          )}
        </form>
      </div>

      {success && (
        <div className="auth-success">
          <div className="success-mark">
            <span className="success-ripple" />
            <span className="success-ripple" />
            <span className="success-ripple" />
            <Logo size={104} />
          </div>
          <div className="success-text">Welcome to Echo</div>
        </div>
      )}
    </div>
  );
}

/* ---- floating "postal letter" icons ---- */
function EnvelopeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </svg>
  );
}
function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </svg>
  );
}

/* ---- inline icons ---- */
function UserIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="6.5" r="3.2" />
      <path d="M3.5 16.5c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
    </svg>
  );
}
function IdIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <circle cx="7" cy="9.5" r="1.8" />
      <path d="M4.8 14c0-1.4 1-2.3 2.2-2.3s2.2.9 2.2 2.3M11.5 8.5h4M11.5 11.5h3" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="9" width="12" height="8" rx="2" />
      <path d="M7 9V6.5a3 3 0 016 0V9" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10z" />
      <circle cx="10" cy="10" r="2.4" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4.7A7 7 0 0110 4.5c5.5 0 8.5 5.5 8.5 5.5a13 13 0 01-2.2 2.8M5 5.8A13 13 0 001.5 10S4.5 15.5 10 15.5a7 7 0 003-.65" />
      <path d="M2 2l16 16" />
    </svg>
  );
}
