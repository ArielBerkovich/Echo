import { lazy, Suspense, useRef } from "react";
import SearchBox from "./SearchBox.js";

// Conversation history, feeds, and browse/search results pull in markdown,
// sanitization, and message interaction code. Load each surface when selected
// so the navigation shell can become interactive without that graph.
const ActivityFeed = lazy(() => import("./ActivityFeed.js"));
const ChannelBrowser = lazy(() => import("./ChannelBrowser.js"));
const ChannelView = lazy(() => import("./ChannelView.js"));
const SavedFeed = lazy(() => import("./SavedFeed.js"));
const SearchResults = lazy(() => import("./SearchResults.js"));
const SettingsModal = lazy(() => import("./SettingsModal.js"));

export default function WorkspaceContent({ view, search, browse, feeds, conversation }) {
  const activeChannel = conversation.channel;
  const channelViewRef = useRef(null);
  const addPeopleChannel = activeChannel &&
    activeChannel.type !== "dm" &&
    activeChannel.name?.toLowerCase() !== "general" &&
    (activeChannel.members || []).includes(conversation.user.id)
      ? activeChannel
      : null;
  const isMember = activeChannel && (activeChannel.members || []).includes(conversation.user.id);
  const isGroupDm = activeChannel?.type === "dm"
    && ((activeChannel.members?.length || 0) > 2 || (activeChannel.participants?.length || 0) > 2);
  const dmUserId = activeChannel?.dmUserId;
  const isActiveConversationView = view === "home"
    || (view === "dms" && activeChannel?.type === "dm");
  const currentChannelActions = isActiveConversationView && activeChannel
    ? activeChannel.type === "dm"
      ? [
        { id: "view-files", label: "View files", keywords: ["files"], group: "Current conversation" },
        ...(isGroupDm
          ? [{ id: "view-members", label: "View members", keywords: ["members", "people", "participants"], group: "Current conversation" }]
          : [{ id: "view-profile", label: "View profile", keywords: ["profile", "person", "user"], group: "Current conversation" }]),
        ...(isGroupDm || dmUserId ? [{
          id: "toggle-dm-starred",
          label: (isGroupDm ? conversation.isChannelStarred : conversation.isStarred) ? "Unstar conversation" : "Star conversation",
          keywords: ["star", "starred", "favorite", "favourite"],
          group: "Current conversation",
        }] : []),
      ]
      : [
        ...(addPeopleChannel ? [{ id: "add-people", label: "Add people", keywords: ["add", "people", "members", "invite"], group: "Current channel" }] : []),
        { id: "search-channel", label: "Search this channel", keywords: ["search", "channel", "messages"], group: "Current channel" },
        { id: "view-channel-details", label: "View channel details", keywords: ["details", "topic", "description"], group: "Current channel" },
        { id: "view-members", label: "View members", keywords: ["members", "people", "participants"], group: "Current channel" },
        { id: "view-files", label: "View files", keywords: ["files"], group: "Current channel" },
        { id: "view-pinned", label: "View pinned messages", keywords: ["pinned", "pins", "messages"], group: "Current channel" },
        ...(isMember ? [{
          id: "toggle-channel-starred",
          label: conversation.isChannelStarred ? "Unstar channel" : "Star channel",
          keywords: ["star", "starred", "favorite", "favourite"],
          group: "Current channel",
        }] : []),
      ]
    : [];

  function handleQuickAction(actionId) {
    if (actionId === "add-people") return search.onAddPeople?.();
    if (actionId === "search-channel") return search.inputRef.current?.searchInChannel(activeChannel.name);
    if (actionId === "view-channel-details") return channelViewRef.current?.openDetailsPanel();
    if (actionId === "view-members") return channelViewRef.current?.openMembersPanel();
    if (actionId === "view-files") return channelViewRef.current?.openFilesPanel();
    if (actionId === "view-pinned") return channelViewRef.current?.openPinnedPanel();
    if (actionId === "toggle-channel-starred") return conversation.onToggleChannelStarred?.(activeChannel.id);
    if (actionId === "view-profile") return conversation.onOpenProfile?.(dmUserId);
    if (actionId === "toggle-dm-starred") {
      return isGroupDm
        ? conversation.onToggleChannelStarred?.(activeChannel.id)
        : conversation.onToggleStarred?.(dmUserId);
    }
    return search.onQuickAction?.(actionId);
  }

  return (
    <div className="chat-pane">
      <div className="pane-search" data-testid="pane-search">
        <SearchBox
          ref={search.inputRef}
          channels={search.channels}
          myChannelIds={search.myChannelIds}
          users={conversation.users}
          recents={search.recents}
          currentChannelActions={currentChannelActions}
          onPickChannel={search.onPickChannel}
          onFindChannels={search.onFindChannels}
          onPickUser={search.onPickUser}
          onQuickAction={handleQuickAction}
          onSearchMessages={search.onSearchMessages}
        />
      </div>
      <ActiveWorkspaceView
        view={view}
        search={search}
        browse={browse}
        feeds={feeds}
        conversation={conversation}
        channelViewRef={channelViewRef}
      />
    </div>
  );
}

function ActiveWorkspaceView({ view, search, browse, feeds, conversation, channelViewRef }) {
  let content;
  if (search.query) {
    content = <SearchResults query={search.query} onJump={search.onJump} onClose={search.onClose} />;
  } else if (view === "browse") {
    content = (
      <ChannelBrowser
        joinedIds={browse.joinedIds}
        hiddenIds={browse.hiddenIds}
        onOpen={browse.onOpen}
        onJoin={browse.onJoin}
        onCreate={browse.onCreate}
        onCatalog={browse.onCatalog}
        onCounts={browse.onCounts}
      />
    );
  } else if (view === "activity") {
    content = (
      <ActivityFeed
        user={feeds.user}
        users={feeds.users}
        customEmojis={feeds.emojis}
        onJump={feeds.onJump}
        onLoaded={feeds.onActivityLoaded}
        onReady={feeds.onActivityReady}
      />
    );
  } else if (view === "saved") {
    content = (
      <SavedFeed
        user={feeds.user}
        users={feeds.users}
        customEmojis={feeds.emojis}
        onJump={feeds.onJump}
        onUnsave={feeds.onUnsave}
      />
    );
  } else if (view === "settings") {
    content = <SettingsModal {...feeds.settings} />;
  } else if (!conversation.channel || (view !== "home" && conversation.channel.type !== "dm")) {
    content = (
      <div className="empty-pane">
        {view === "dms" ? "Select a conversation, or start a new one." : "Search to start a conversation."}
      </div>
    );
  } else {
    const { channel, ...props } = conversation;
    content = <ChannelView ref={channelViewRef} key={channel.id} channel={channel} {...props} />;
  }

  return <Suspense fallback={<div className="empty-state"><p>Loading…</p></div>}>{content}</Suspense>;
}
