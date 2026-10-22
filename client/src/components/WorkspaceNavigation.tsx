import { useEffect, useRef, useState } from "react";
import LeftRail from "./LeftRail.js";
import Sidebar from "./Sidebar.js";
import SearchBox from "./SearchBox.js";
import { ArrowLeftIcon, ArrowRightIcon, Clock3Icon, HashIcon, SparklesIcon } from "lucide-react";
import { shortcutTitle } from "../lib/keyboardShortcuts.js";
import { useI18n } from "../lib/i18n.js";

export default function WorkspaceNavigation({
  view,
  user,
  workspace,
  workspaceLoading = false,
  channels,
  dms,
  customEmojis = [],
  activityItems = [],
  hidden,
  starredIds,
  starredChannelIds,
  onlineIds,
  activeChannel,
  activityBadge,
  forceSidebar = false,
  publicChannelCount,
  mode,
  onSelectView,
  recents = [],
  onSelectChannel,
  onSelectRecentChannel,
  onPrefetchChannel,
  onCreateChannel,
  onOpenGroups,
  onBrowseChannels,
  onStartConversation,
  onOpenDm,
  onHideDm,
  onHideChannel,
  onToggleChannelStarred,
  onLogout,
  onUpdated,
  onOpenSettings,
  onOpenApiDocs,
  onOpenWalkthrough,
  onNavigateBack,
  onNavigateForward,
  canNavigateBack = false,
  canNavigateForward = false,
  onToggleMode,
  search,
}) {
  const { t } = useI18n();
  const [recentsOpen, setRecentsOpen] = useState(false);
  const recentsRef = useRef(null);
  const recentChannels = recents.filter((recent) => recent.type === "channel");

  useEffect(() => {
    if (!recentsOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!recentsRef.current?.contains(event.target)) setRecentsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setRecentsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [recentsOpen]);
  const badges = {
    home: channels.reduce((sum, channel) => sum + (channel.unread || 0), 0),
    dms: dms.reduce((sum, conversation) => sum + (conversation.unread || 0), 0),
    activity: activityBadge,
  };
  const showSidebar = forceSidebar || (
    view !== "activity" &&
    view !== "saved" &&
    view !== "settings" &&
    view !== "browse" &&
    view !== "groups"
  );

  return (
    <div className={`app-nav${showSidebar ? "" : " no-sidebar"}`}>
      <div className="workspace-rail">
        <LeftRail
        view={view}
        onSelect={onSelectView}
        onBrowseChannels={onBrowseChannels}
        onOpenGroups={onOpenGroups}
        user={user}
        workspace={workspace}
        workspaceLoading={workspaceLoading}
        onLogout={onLogout}
        onUpdated={onUpdated}
        badges={badges}
        customEmojis={customEmojis}
        latestActivity={activityItems[0]}
        />
      </div>
      <div className="workspace-search" data-testid="workspace-search">
        <div className="workspace-search-inner">
          <div className="workspace-search-navigation" ref={recentsRef}>
            <button type="button" onClick={onNavigateBack} disabled={!canNavigateBack} title={t("goBack")} aria-label={t("goBack")}>
              <ArrowLeftIcon size={14} strokeWidth={2} aria-hidden="true" />
            </button>
            <button type="button" onClick={onNavigateForward} disabled={!canNavigateForward} title={t("goForward")} aria-label={t("goForward")}>
              <ArrowRightIcon size={14} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`workspace-recent-channels-trigger${recentsOpen ? " active" : ""}`}
              data-testid="recent-channels-trigger"
              onClick={() => setRecentsOpen((open) => !open)}
              title={t("recentChannels")}
              aria-label={t("recentChannels")}
              aria-expanded={recentsOpen}
              aria-haspopup="menu"
            >
              <Clock3Icon size={16} strokeWidth={2} aria-hidden="true" />
            </button>
            {recentsOpen ? <>
              <div className="menu-overlay" onMouseDown={() => setRecentsOpen(false)} />
              <div className="rail-more-menu workspace-recent-channels-menu" role="menu" aria-label={t("recentChannels")} data-testid="recent-channels-menu">
                <div className="rail-recents-heading">{t("recentChannels")}</div>
                {recentChannels.length === 0 ? (
                  <div className="rail-recents-empty">{t("noRecentChannels")}</div>
                ) : recentChannels.map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    role="menuitem"
                    data-testid="recent-channel-item"
                    aria-current={channel.id === activeChannel?.id ? "page" : undefined}
                    className={channel.id === activeChannel?.id ? "active" : ""}
                    onClick={() => { setRecentsOpen(false); onSelectRecentChannel?.(channel); }}
                    title={t("openChannel")}
                  >
                    <HashIcon size={15} aria-hidden="true" />
                    <span className="rail-recents-channel-name" dir="auto">{channel.name}</span>
                  </button>
                ))}
              </div>
            </> : null}
          </div>
          <SearchBox
            ref={search.inputRef}
            channels={search.channels}
            myChannelIds={search.myChannelIds}
            users={search.users}
            recents={search.recents}
            currentChannelActions={search.currentChannelActions}
            onPickChannel={search.onPickChannel}
            onFindChannels={search.onFindChannels}
            onPickUser={search.onPickUser}
            onPickDm={search.onPickDm}
            onQuickAction={search.onQuickAction}
            onSearchMessages={search.onSearchMessages}
            activeConversationId={search.activeConversationId}
            hasMessageSearch={search.hasMessageSearch}
          />
          <div className="workspace-search-tools">
            <button
              type="button"
              className="workspace-search-actions"
              onClick={() => search.inputRef.current?.openSwitcher()}
              title={shortcutTitle(t("openActions"), "open-switcher")}
              aria-label={t("openActions")}
            >
              <SparklesIcon size={14} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="workspace-search-help"
              onClick={onOpenWalkthrough}
              title={t("openWalkthrough")}
              aria-label={t("openWalkthrough")}
            >
              <span aria-hidden="true">?</span>
            </button>
          </div>
        </div>
      </div>
      {showSidebar ? (
        <div className="workspace-sidebar">
          <Sidebar
            user={user}
            channels={channels}
            dms={dms}
            customEmojis={customEmojis}
            hidden={hidden}
            starredIds={starredIds}
            starredChannelIds={starredChannelIds}
            onlineIds={onlineIds}
            activeChannel={activeChannel}
            mode={view === "dms" ? "dms" : "home"}
            onSelect={onSelectChannel}
            onPrefetchChannel={onPrefetchChannel}
            onNewChannel={onCreateChannel}
            onOpenGroups={onOpenGroups}
            onBrowseChannels={onBrowseChannels}
            browsingChannels={view === "browse"}
            publicChannelCount={publicChannelCount}
            onStartConversation={onStartConversation}
            onOpenDm={onOpenDm}
            onPrefetchDm={onPrefetchChannel}
            onHideDm={onHideDm}
            onHideChannel={onHideChannel}
            onToggleChannelStarred={onToggleChannelStarred}
            onLogout={onLogout}
            onOpenSettings={onOpenSettings}
            onOpenApiDocs={onOpenApiDocs}
            themeMode={mode}
            onToggleTheme={onToggleMode}
          />
        </div>
      ) : null}
    </div>
  );
}
