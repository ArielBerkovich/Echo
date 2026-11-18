import { useEffect, useState } from "react";
import { api } from "../api.js";
import { findHideCandidates } from "../lib/hideCandidates.js";
import { useI18n } from "../lib/i18n.js";
import Avatar from "./Avatar.js";
import Modal, { ModalActions } from "./Modal.js";

export default function HideUsersDialog({ currentUserId, onUserUpdated, onClose }) {
  const { t, translateError } = useI18n();
  const [groups, setGroups] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const users = [];
        const seenIds = new Set();
        for (let page = 0; ; page++) {
          const result = await api.listUsers({ page, limit: 200 });
          if (cancelled) return;
          for (const user of result.users) {
            if (!seenIds.has(user.id)) { users.push(user); seenIds.add(user.id); }
          }
          if (!result.hasMore) break;
        }
        setGroups(findHideCandidates(users, currentUserId));
      } catch (err) {
        if (!cancelled) setError(translateError(err.message));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [currentUserId, attempt, translateError]);

  const remaining = groups ? [...groups.archived, ...groups.duplicates].filter((user) => !hiddenIds.has(user.id)) : [];
  async function hide(users) {
    setBusy(true);
    setError(null);
    const failures = [];
    for (const user of users) {
      try {
        const { user: updated } = await api.setUserHidden(user.id, true);
        setHiddenIds((previous) => new Set([...previous, user.id]));
        onUserUpdated(updated);
      } catch (err) { failures.push(`${user.username}: ${translateError(err.message)}`); }
    }
    if (failures.length) setError(failures.join(" · "));
    setBusy(false);
  }

  return <Modal title={t("findUsersToHide")} className="hide-users-dialog" testId="hide-users-dialog" closeDisabled={busy} onClose={onClose}>
    <p className="settings-hint">{t("hideCandidatesDescription")}</p>
    <div className="hide-users-results" aria-busy={loading || busy}>
      {loading && <p role="status">{t("findingUsersToHide")}</p>}
      {!loading && groups && [["archived", "archivedHideCandidates"], ["duplicates", "duplicateHideCandidates"]].map(([key, label]) => <section key={key} data-testid={`hide-candidates-${key}`}>
        <h4>{t(label)} ({groups[key].length})</h4>
        {groups[key].length === 0 && <p className="settings-hint">{t("noHideCandidates")}</p>}
        {groups[key].map((user) => <div className="hide-candidate-row" key={user.id} data-testid={`hide-candidate-${user.username}`}>
          <Avatar name={user.displayName} src={user.avatarUrl} size={28} />
          <span className="hide-candidate-identity"><strong>{user.displayName}</strong><bdi dir="ltr">@{user.username}</bdi></span>
          <button type="button" className="btn-secondary" disabled={busy || hiddenIds.has(user.id)} onClick={() => hide([user])}>{hiddenIds.has(user.id) ? t("hiddenUserLabel") : t("hideUser")}</button>
        </div>)}
      </section>)}
    </div>
    {error && <div className="error" role="alert">{error}</div>}
    {!loading && !groups && <button type="button" className="btn-secondary" onClick={() => setAttempt((value) => value + 1)}>{t("retryHideCandidates")}</button>}
    <p role="status" aria-live="polite">{hiddenIds.size > 0 ? t("usersHiddenCount").replace("{count}", String(hiddenIds.size)) : ""}</p>
    <ModalActions>
      <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>{t("close")}</button>
      <button type="button" className="btn-primary" disabled={loading || busy || remaining.length === 0} onClick={() => hide(remaining)}>{busy ? t("hidingUsers") : t("hideAllCandidates")}</button>
    </ModalActions>
  </Modal>;
}
