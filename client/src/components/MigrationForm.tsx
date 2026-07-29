import { useEffect, useState } from "react";
import { ArrowLeftIcon, EyeIcon, EyeOffIcon, LockIcon, UserIcon } from "lucide-react";
import { api } from "../api.js";

function callbackState() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return {
    ready: params.get("migration") === "rhsso-ready",
    error: params.get("migration_error") || "",
  };
}

export default function MigrationForm({ rhssoEnabled, onAuthed, onBack }) {
  const initial = callbackState();
  const [step, setStep] = useState(initial.ready ? "rhsso-confirm" : "source");
  const [source, setSource] = useState(null);
  const [target, setTarget] = useState(null);
  const [oldUsername, setOldUsername] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initial.error);

  useEffect(() => {
    if (!initial.ready && !initial.error) return;
    sessionStorage.setItem("echo.ssoBypass", "true");
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    if (!initial.ready) return;
    setBusy(true);
    api.migrationStatus()
      .then((status) => {
        setSource(status.source);
        setTarget(status.target);
        setNewUsername(status.target?.username || "");
      })
      .catch((err) => {
        setError(err.message);
        setStep("source");
      })
      .finally(() => setBusy(false));
  }, []);

  async function begin(targetType) {
    setError("");
    setBusy(true);
    try {
      const result = await api.startMigration({ oldUsername, oldPassword, targetType });
      setSource(result.source);
      if (targetType === "rhsso") {
        window.location.assign(result.authorizationUrl);
        return;
      }
      setStep("local");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setError("");
    if (!newUsername.trim()) {
      setError("Choose a new username.");
      return;
    }
    if (step === "local" && newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.confirmMigration({
        username: newUsername,
        ...(step === "local" ? { password: newPassword } : {}),
      });
      onAuthed(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (step === "source") {
    return (
      <div className="migration-form" data-testid="migration-source">
        <button type="button" className="auth-back" onClick={onBack} aria-label="Back">
          <ArrowLeftIcon size={14} /> Back
        </button>
        <p className="subtitle">Bring the history from an old local Echo account.</p>
        <div className="setup-callout">
          The old account must have been created without RHSSO. Its display name,
          avatar, messages, and memberships will be preserved.
        </div>
        <label className="field">
          <span>Old username</span>
          <div className="input-wrap">
            <UserIcon size={17} strokeWidth={1.6} />
            <input
              value={oldUsername}
              onChange={(event) => setOldUsername(event.target.value)}
              autoComplete="username"
              placeholder="Old Echo username"
            />
          </div>
        </label>
        <label className="field">
          <span>Old password</span>
          <div className="input-wrap">
            <LockIcon size={17} strokeWidth={1.6} />
            <input
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
              type={showPasswords ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Old Echo password"
            />
            <button type="button" className="pw-toggle" onClick={() => setShowPasswords((value) => !value)} tabIndex={-1}>
              {showPasswords ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
            </button>
          </div>
        </label>
        {error && <span className="field-hint error small">{error}</span>}
        <button
          type="button"
          className="btn-primary auth-submit"
          disabled={busy || !oldUsername || !oldPassword}
          onClick={() => begin("local")}
        >
          {busy ? <span className="spinner" /> : "Create a new local login"}
        </button>
        {rhssoEnabled && (
          <>
            <div className="auth-divider"><span>or</span></div>
            <button
              type="button"
              className="auth-sso"
              disabled={busy || !oldUsername || !oldPassword}
              onClick={() => begin("rhsso")}
            >
              Continue with RHSSO
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="migration-form" data-testid="migration-confirm">
      <p className="subtitle">Confirm the identity replacement.</p>
      {source && (
        <div className="setup-callout">
          <strong>{source.displayName}</strong> remains the display name.<br />
          @{source.username} will stop being a login and become a historical alias.
        </div>
      )}
      {step === "rhsso-confirm" && target && (
        <span className="field-hint">
          RHSSO identity verified: {target.identityLabel || target.username}
        </span>
      )}
      <label className="field">
        <span>New username</span>
        <div className="input-wrap">
          <UserIcon size={17} strokeWidth={1.6} />
          <input
            value={newUsername}
            onChange={step === "local"
              ? (event) => setNewUsername(event.target.value.toLowerCase())
              : undefined}
            readOnly={step === "rhsso-confirm"}
            autoComplete="username"
            placeholder="New Echo username"
          />
        </div>
      </label>
      {step === "local" && (
        <>
          <label className="field">
            <span>New password</span>
            <div className="input-wrap">
              <LockIcon size={17} strokeWidth={1.6} />
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Create a new password"
              />
            </div>
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <div className="input-wrap">
              <LockIcon size={17} strokeWidth={1.6} />
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter the new password"
              />
            </div>
          </label>
        </>
      )}
      {error && <span className="field-hint error small">{error}</span>}
      <button type="button" className="btn-primary auth-submit" disabled={busy} onClick={confirm}>
        {busy ? <span className="spinner" /> : "Replace login and keep history"}
      </button>
      <button type="button" className="link" disabled={busy} onClick={onBack}>
        Cancel migration
      </button>
    </div>
  );
}
