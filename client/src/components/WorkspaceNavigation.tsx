import LeftRail from "./LeftRail.js";
import Sidebar from "./Sidebar.js";

export default function WorkspaceNavigation({
  view,
  user,
  channels,
  dms,
  hidden,
  vipIds,
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
  onBrowseChannels,
  onStartConversation,
  onOpenDm,
  onHideDm,
  onHideChannel,
  onLogout,
  onOpenSettings,
  onOpenApiDocs,
  onToggleMode,
}) {
  const badges = {
    home: channels.reduce((sum, channel) => sum + (channel.unread || 0), 0),
    dms: dms.reduce((sum, conversation) => sum + (conversation.unread || 0), 0),
    activity: activityBadge,
  };
  const showSidebar = forceSidebar || (view !== "activity" && view !== "saved");

  return (
    <div className="app-nav">
      <LeftRail view={view === "browse" ? "home" : view} onSelect={onSelectView} user={user} badges={badges} />
      {showSidebar ? (
        <Sidebar
          user={user}
          channels={channels}
          dms={dms}
          hidden={hidden}
          vipIds={vipIds}
          onlineIds={onlineIds}
          activeChannel={activeChannel}
          mode={view === "dms" ? "dms" : "home"}
          onSelect={onSelectChannel}
          onPrefetchChannel={onPrefetchChannel}
          onNewChannel={onCreateChannel}
          onBrowseChannels={onBrowseChannels}
          browsingChannels={view === "browse"}
          publicChannelCount={publicChannelCount}
          onStartConversation={onStartConversation}
          onOpenDm={onOpenDm}
          onPrefetchDm={onPrefetchChannel}
          onHideDm={onHideDm}
          onHideChannel={onHideChannel}
          onLogout={onLogout}
          onOpenSettings={onOpenSettings}
          onOpenApiDocs={onOpenApiDocs}
          themeMode={mode}
          onToggleTheme={onToggleMode}
        />
      ) : null}
    </div>
  );
}
