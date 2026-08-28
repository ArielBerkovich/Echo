import { lazy, Suspense, useEffect } from "react";
import SearchBox from "./SearchBox.js";

// Conversation history, feeds, and browse/search results pull in markdown,
// sanitization, and message interaction code. Load each surface when selected
// so the navigation shell can become interactive without that graph.
const ActivityFeed = lazy(() => import("./ActivityFeed.js"));
const ChannelBrowser = lazy(() => import("./ChannelBrowser.js"));
const loadChannelView = () => import("./ChannelView.js");
const ChannelView = lazy(loadChannelView);
const SavedFeed = lazy(() => import("./SavedFeed.js"));
const SearchResults = lazy(() => import("./SearchResults.js"));
const SettingsModal = lazy(() => import("./SettingsModal.js"));

export default function WorkspaceContent({ view, search, browse, feeds, conversation, homeChannel }) {
  // Activity is commonly a short-lived stop before returning to a channel.
  // Warm the conversation chunk while the feed is visible so navigation back
  // to Home does not pay the dynamic-import cost on the critical interaction.
  useEffect(() => {
    if (view !== "activity") return undefined;
    const preload = () => loadChannelView();
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(preload, { timeout: 500 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timeoutId = window.setTimeout(preload, 0);
    return () => window.clearTimeout(timeoutId);
  }, [view]);

  const activeChannel = conversation.channel;
  const addPeopleChannel = activeChannel &&
    activeChannel.type !== "dm" &&
    activeChannel.name?.toLowerCase() !== "general" &&
    (activeChannel.members || []).includes(conversation.user.id)
      ? activeChannel
      : null;

  return (
    <div className="chat-pane">
      <div className="pane-search" data-testid="pane-search">
        <SearchBox
          ref={search.inputRef}
          channels={search.channels}
          myChannelIds={search.myChannelIds}
          users={conversation.users}
          recents={search.recents}
          addPeopleChannel={addPeopleChannel}
          onPickChannel={search.onPickChannel}
          onFindChannels={search.onFindChannels}
          onPickUser={search.onPickUser}
          onAddPeople={search.onAddPeople}
          onSearchMessages={search.onSearchMessages}
        />
      </div>
      <ActiveWorkspaceView
        view={view}
        homeChannel={homeChannel}
        search={search}
        browse={browse}
        feeds={feeds}
        conversation={conversation}
      />
    </div>
  );
}

function ActiveWorkspaceView({ view, homeChannel, search, browse, feeds, conversation }) {
  const preservedChannel = view === "home" ? conversation.channel : (homeChannel || conversation.channel);
  const homeConversation = preservedChannel && preservedChannel.id === conversation.channel?.id
    ? conversation
    : preservedChannel
      ? { ...conversation, channel: preservedChannel, cachedMessages: null, initialScrollState: null }
      : null;
  const preserveHome = !search.query && (
    view === "activity"
    || view === "saved"
    || (view === "dms" && !conversation.channel)
  ) && !!homeConversation;
  const homeContent = (preserveHome || (!search.query && view === "home" && !!conversation.channel))
    ? <ConversationView conversation={homeConversation || conversation} />
    : null;
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
  } else if (view === "home") {
    content = homeContent ? null : <div className="empty-pane">Search to start a conversation.</div>;
  } else if (!conversation.channel || conversation.channel.type !== "dm") {
    content = (
      <div className="empty-pane">
        {view === "dms" ? "Select a conversation, or start a new one." : "Search to start a conversation."}
      </div>
    );
  } else {
    content = <ConversationView conversation={conversation} />;
  }

  return (
    <Suspense fallback={<div className="empty-state"><p>Loading…</p></div>}>
      {content}
      {homeContent ? (
        <div className={`preserved-home ${preserveHome ? "preserved-home-hidden" : ""}`} aria-hidden={preserveHome || undefined}>
          {homeContent}
        </div>
      ) : null}
    </Suspense>
  );
}

function ConversationView({ conversation }) {
  const { channel, ...props } = conversation;
  return <ChannelView key={channel.id} channel={channel} {...props} />;
}
