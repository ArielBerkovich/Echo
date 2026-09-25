import { useEffect, useState } from "react";
import { ArrowLeftIcon, EyeIcon, EyeOffIcon, LockIcon, UserIcon } from "lucide-react";
import { api } from "../api.js";
import { useI18n } from "../lib/i18n.js";

function callbackState() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return {
    ready: params.get("migration") === "rhsso-ready",
    error: params.get("migration_error") || "",
  };
}

export default function MigrationForm({ rhssoEnabled, onAuthed, onBack }) {
  const { t, translateError } = useI18n();
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
        setError(translateError(err.message));
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
      setError(translateError(err.message));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setError("");
    if (!newUsername.trim()) {
      setError(t("migrationChooseUsername"));
      return;
    }
    if (step === "local" && newPassword !== confirmPassword) {
      setError(t("passwordsDoNotMatch"));
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
      setError(translateError(err.message));
    } finally {
      setBusy(false);
    }
  }

  if (step === "source") {
    return (
      <div className="migration-form" data-testid="migration-source">
        <button type="button" className="auth-back" onClick={onBack} aria-label={t("back")}>
          <ArrowLeftIcon size={14} /> {t("back")}
        </button>
        <p className="subtitle">{t("migrationSourceSubtitle")}</p>
        <div className="setup-callout">
          {t("migrationSourceHint")}
        </div>
        <label className="field">
          <span>{t("migrationOldUsername")}</span>
          <div className="input-wrap">
            <UserIcon size={17} strokeWidth={1.6} />
            <input
              value={oldUsername}
              onChange={(event) => setOldUsername(event.target.value)}
              autoComplete="username"
              placeholder={t("migrationOldEchoUsername")}
            />
          </div>
        </label>
        <label className="field">
          <span>{t("migrationOldPassword")}</span>
          <div className="input-wrap">
            <LockIcon size={17} strokeWidth={1.6} />
            <input
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
              type={showPasswords ? "text" : "password"}
              autoComplete="current-password"
              placeholder={t("migrationOldEchoPassword")}
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
          {busy ? <span className="spinner" /> : t("migrationCreateLocalLogin")}
        </button>
        {rhssoEnabled && (
          <>
            <div className="auth-divider"><span>{t("or")}</span></div>
            <button
              type="button"
              className="auth-sso"
              disabled={busy || !oldUsername || !oldPassword}
              onClick={() => begin("rhsso")}
            >
              {t("migrationContinueRhsso")}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="migration-form" data-testid="migration-confirm">
      <p className="subtitle">{t("migrationConfirmSubtitle")}</p>
      {source && (
        <div className="setup-callout">
          {t("migrationIdentityHint").replace("{displayName}", source.displayName).replace("{username}", source.username)}
        </div>
      )}
      {step === "rhsso-confirm" && target && (
        <span className="field-hint">
          {t("migrationRhssoVerified").replace("{identity}", target.identityLabel || target.username)}
        </span>
      )}
      <label className="field">
        <span>{t("migrationNewUsername")}</span>
        <div className="input-wrap">
          <UserIcon size={17} strokeWidth={1.6} />
          <input
            value={newUsername}
            onChange={step === "local"
              ? (event) => setNewUsername(event.target.value.toLowerCase())
              : undefined}
            readOnly={step === "rhsso-confirm"}
            autoComplete="username"
            placeholder={t("migrationNewEchoUsername")}
          />
        </div>
      </label>
      {step === "local" && (
        <>
          <label className="field">
            <span>{t("newPassword")}</span>
            <div className="input-wrap">
              <LockIcon size={17} strokeWidth={1.6} />
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                placeholder={t("migrationCreateNewPassword")}
              />
            </div>
          </label>
          <label className="field">
            <span>{t("confirmNewPassword")}</span>
            <div className="input-wrap">
              <LockIcon size={17} strokeWidth={1.6} />
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder={t("migrationReenterPassword")}
              />
            </div>
          </label>
        </>
      )}
      {error && <span className="field-hint error small">{error}</span>}
      <button type="button" className="btn-primary auth-submit" disabled={busy} onClick={confirm}>
        {busy ? <span className="spinner" /> : t("migrationReplaceLogin")}
      </button>
      <button type="button" className="link" disabled={busy} onClick={onBack}>
        {t("migrationCancel")}
      </button>
    </div>
  );
}
