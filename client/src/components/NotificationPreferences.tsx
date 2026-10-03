import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellIcon, BellOffIcon, ChevronDownIcon } from "lucide-react";
import { api } from "../api.js";
import { queryKeys } from "../lib/queryClient.js";
import { useI18n } from "../lib/i18n.js";

export function NotificationDefaults() {
  const { t } = useI18n();
  const client = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.notificationSettings, queryFn: api.getNotificationSettings });
  const [overridesExpanded, setOverridesExpanded] = useState(null);
  const entries = Object.entries(query.data?.conversations || {});
  const expanded = overridesExpanded ?? entries.length <= 5;
  async function save(defaults) {
    const previous = client.getQueryData(queryKeys.notificationSettings);
    client.setQueryData(queryKeys.notificationSettings, { ...previous, defaults });
    try {
      const next = await api.updateNotificationSettings({ defaults });
      client.setQueryData(queryKeys.notificationSettings, next);
    } catch (error) {
      client.setQueryData(queryKeys.notificationSettings, previous);
      throw error;
    }
  }
  return <div className="notification-default-options" role="radiogroup" aria-label={t("notificationDefaults")}>
    {[ ["mentions", t("notifyMentionsAndDms")], ["all", t("notifyAllMessages")] ].map(([value, label]) => <label key={value}>
      <input type="radio" name="notification-default" value={value} checked={(query.data?.defaults || "mentions") === value} disabled={query.isLoading} onChange={() => save(value).catch(() => {})} />
      <span>{label}</span>
    </label>)}
    {entries.length > 0 && <section className="notification-exceptions">
      <button
        type="button"
        className="notification-exceptions-toggle"
        aria-expanded={expanded}
        aria-controls="notification-exception-list"
        onClick={() => setOverridesExpanded(!expanded)}
      >
        <span>{t("notificationOverridesCount").replace("{count}", String(entries.length))}</span>
        <ChevronDownIcon size={15} aria-hidden="true" />
      </button>
      <div id="notification-exception-list" className="notification-exception-list" hidden={!expanded}>
        {entries.map(([id, rule]) => <div className="notification-exception" key={id}>
          <span>{query.data.labels?.[id] || t("conversationNotifications")}</span>
          <span>{rule === "mute" ? t("muteConversation") : rule === "all" ? t("notifyAllMessages") : t("notifyMentionsOnly")}</span>
          <button type="button" onClick={() => api.updateNotificationSettings({ conversationId: id, rule: "default" }).then((next) => client.setQueryData(queryKeys.notificationSettings, next)).catch(() => {})}>{t("resetToDefault")}</button>
        </div>)}
      </div>
    </section>}
  </div>;
}

export default function ConversationNotificationButton({ channel, onToast }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const controlRef = useRef(null);
  const query = useQuery({ queryKey: queryKeys.notificationSettings, queryFn: api.getNotificationSettings });
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!controlRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);
  if (!channel) return null;
  const rule = query.data?.conversations?.[channel.id] || "default";
  const muted = rule === "mute";
  const supportsMentionsOnly = channel.type !== "dm" || (channel.members || []).length > 2;
  async function save(nextRule) {
    const previous = client.getQueryData(queryKeys.notificationSettings);
    client.setQueryData(queryKeys.notificationSettings, {
      ...previous,
      conversations: { ...previous?.conversations, [channel.id]: nextRule === "default" ? undefined : nextRule },
    });
    try {
      const next = await api.updateNotificationSettings({ conversationId: channel.id, rule: nextRule });
      client.setQueryData(queryKeys.notificationSettings, next);
      onToast?.(t("notificationPreferenceSaved"));
    } catch (error) {
      client.setQueryData(queryKeys.notificationSettings, previous);
      throw error;
    }
  }
  return <div className="conversation-notification-control" ref={controlRef}>
    <button type="button" className={`header-action header-action-icon${muted ? " active" : ""}`} data-testid="conversation-notifications" aria-label={muted ? t("notificationsMuted") : t("conversationNotifications")} aria-expanded={open} title={t("conversationNotifications")} onClick={() => setOpen(!open)}>
      {muted ? <BellOffIcon size={16} strokeWidth={1.8} /> : <BellIcon size={16} strokeWidth={1.8} />}
    </button>
    {open && <div className="conversation-notification-menu" role="group" aria-label={t("conversationNotifications")}>
      {[["default", t("useNotificationDefault")], ["all", t("notifyAllMessages")], ...(supportsMentionsOnly ? [["mentions", t("notifyMentionsOnly")]] : []), ["mute", t("muteConversation")]].map(([value, label]) => <button type="button" role="menuitemradio" aria-checked={rule === value} key={value} onClick={() => save(value).then(() => setOpen(false)).catch(() => {})}>{label}{rule === value ? " ✓" : ""}</button>)}
    </div>}
  </div>;
}
