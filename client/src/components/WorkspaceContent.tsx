import { lazy, Suspense } from "react";
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
const AllureReport = lazy(() => import("./AllureReport.js"));

export default function WorkspaceContent({ view, search, browse, feeds, conversation }) {
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
        search={search}
        browse={browse}
        feeds={feeds}
        conversation={conversation}
      />
    </div>
  );
}

function ActiveWorkspaceView({ view, search, browse, feeds, conversation }) {
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
    content = channel.external?.type === "allure"
      ? <AllureReport channel={channel} />
      : <ChannelView key={channel.id} channel={channel} {...props} />;
  }

  return <Suspense fallback={<div className="empty-state"><p>Loading…</p></div>}>{content}</Suspense>;
}
