import LeftRail from "./LeftRail.js";
import Sidebar from "./Sidebar.js";
import SearchBox from "./SearchBox.js";
import { ArrowLeftIcon, ArrowRightIcon, SparklesIcon } from "lucide-react";
import { shortcutTitle } from "../lib/keyboardShortcuts.js";

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
  onSelectChannel,
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
  onToggleMode,
  search,
}) {
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
          <div className="workspace-search-navigation">
            <button type="button" onClick={onNavigateBack} title="Go back" aria-label="Go back">
              <ArrowLeftIcon size={14} strokeWidth={2} aria-hidden="true" />
            </button>
            <button type="button" onClick={onNavigateForward} title="Go forward" aria-label="Go forward">
              <ArrowRightIcon size={14} strokeWidth={2} aria-hidden="true" />
            </button>
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
          />
          <div className="workspace-search-tools">
            <button
              type="button"
              className="workspace-search-actions"
              onClick={() => search.inputRef.current?.openSwitcher()}
              title={shortcutTitle("Open actions", "open-switcher")}
              aria-label="Open actions"
            >
              <SparklesIcon size={14} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="workspace-search-help"
              onClick={onOpenWalkthrough}
              title="Open walkthrough"
              aria-label="Open walkthrough"
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
