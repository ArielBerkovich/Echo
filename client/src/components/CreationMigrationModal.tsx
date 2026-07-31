import { useEffect, useState } from "react";
import { LockIcon, UserIcon } from "lucide-react";
import { api } from "../api.js";
import Modal from "./Modal.js";

export default function CreationMigrationModal({
  kind,
  newAccount,
  onAuthed,
  onClose,
}) {
  const [oldUsername, setOldUsername] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [targetUsername, setTargetUsername] = useState(newAccount?.username || "");
  const [targetLabel, setTargetLabel] = useState("");
  const [showMigration, setShowMigration] = useState(kind === "local");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function completeAuthentication(result) {
    if (kind === "rhsso") {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`
      );
    }
    onAuthed(result);
  }

  useEffect(() => {
    if (kind !== "rhsso") return;
    let cancelled = false;
    setBusy(true);
    api.migrationStatus()
      .then(({ target }) => {
        if (cancelled) return;
        setTargetUsername(target?.username || "");
        setTargetLabel(target?.identityLabel || target?.username || "");
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  async function migrate() {
    setError("");
    setBusy(true);
    try {
      if (kind === "local") {
        await api.startMigration({
          oldUsername,
          oldPassword,
          targetType: "local",
        });
        completeAuthentication(await api.confirmMigration({
          username: newAccount.username,
          password: newAccount.password,
        }));
        return;
      }
      await api.attachMigrationSource({ oldUsername, oldPassword });
      completeAuthentication(await api.confirmMigration({}));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function createRhssoAccount() {
    setError("");
    setBusy(true);
    try {
      completeAuthentication(await api.createRhssoUser());
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const title = kind === "rhsso" ? "Create your Echo account" : "Bring your history";

  return (
    <Modal
      title={title}
      className="auth-creation-modal"
      backdropClassName="auth-creation-backdrop"
      closeDisabled={kind === "rhsso"}
      showHeader={false}
      showClose={kind === "local"}
      testId="creation-migration-modal"
      onClose={onClose}
    >
        <h2 id="creation-migration-title">
          {title}
        </h2>
        {kind === "rhsso" && !showMigration ? (
          <>
            <p>
              Signed in as <strong>{targetLabel || "your RHSSO identity"}</strong>.
              Is this a new Echo account, or do you have an old local account whose
              history you want to keep?
            </p>
            {error ? <span className="field-hint error small">{error}</span> : null}
            <div className="creation-choice-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => setShowMigration(true)}
              >
                Bring history from an old account
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={createRhssoAccount}
              >
                {busy ? <span className="spinner" /> : "Create a new Echo account"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              Enter the credentials for the old local Echo account. Its display
              name, avatar, messages, and memberships will be preserved.
            </p>
            <label className="field">
              <span>Old username</span>
              <div className="input-wrap">
                <UserIcon size={17} />
                <input
                  value={oldUsername}
                  onChange={(event) => setOldUsername(event.target.value)}
                  autoComplete="username"
                  placeholder="Old Echo username"
                  autoFocus
                />
              </div>
            </label>
            <label className="field">
              <span>Old password</span>
              <div className="input-wrap">
                <LockIcon size={17} />
                <input
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                  type="password"
                  autoComplete="current-password"
                  placeholder="Old Echo password"
                />
              </div>
            </label>
            {kind === "rhsso" ? (
              <label className="field">
                <span>RHSSO username</span>
                <div className="input-wrap">
                  <UserIcon size={17} />
                  <input
                    value={targetUsername}
                    readOnly
                    autoComplete="username"
                    aria-describedby="rhsso-username-help"
                  />
                </div>
                <span id="rhsso-username-help" className="field-hint">
                  This username is managed by RHSSO and cannot be changed in Echo.
                </span>
              </label>
            ) : null}
            {error ? <span className="field-hint error small">{error}</span> : null}
            <div className="creation-choice-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !oldUsername || !oldPassword || !targetUsername}
                onClick={migrate}
              >
                {busy ? <span className="spinner" /> : "Keep old history and continue"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={kind === "rhsso" ? () => setShowMigration(false) : onClose}
              >
                Back
              </button>
            </div>
          </>
        )}
    </Modal>
  );
}
