import { useEffect, useState } from "react";
import { EyeIcon, EyeOffIcon, IdCardIcon, LockIcon, MailIcon, NotebookTextIcon, UserIcon } from "lucide-react";
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
                {f.t === "note" ? <NotebookTextIcon /> : <MailIcon />}
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
              <UserIcon size={17} strokeWidth={1.6} />
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
                <IdCardIcon size={17} strokeWidth={1.6} />
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
              <LockIcon size={17} strokeWidth={1.6} />
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
                {showPw ? <EyeOffIcon size={17} strokeWidth={1.6} /> : <EyeIcon size={17} strokeWidth={1.6} />}
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
