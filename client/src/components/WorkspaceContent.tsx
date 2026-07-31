import ActivityFeed from "./ActivityFeed.js";
import ChannelBrowser from "./ChannelBrowser.js";
import ChannelView from "./ChannelView.js";
import SavedFeed from "./SavedFeed.js";
import SearchBox from "./SearchBox.js";
import SearchResults from "./SearchResults.js";

export default function WorkspaceContent({ view, search, browse, feeds, conversation, onOpenNavigation }) {
  const activeChannel = conversation.channel;
  const addPeopleChannel = activeChannel &&
    activeChannel.type !== "dm" &&
    activeChannel.name?.toLowerCase() !== "general" &&
    (activeChannel.members || []).includes(conversation.user.id)
      ? activeChannel
      : null;

  return (
    <div className="chat-pane">
      <div className="pane-search">
        <button className="nav-toggle" onClick={onOpenNavigation} aria-label="Open navigation" title="Menu">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
        </button>
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
  if (search.query) {
    return <SearchResults query={search.query} onJump={search.onJump} onClose={search.onClose} />;
  }
  if (view === "browse") {
    return (
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
  }
  if (view === "activity") {
    return (
      <ActivityFeed
        user={feeds.user}
        users={feeds.users}
        customEmojis={feeds.emojis}
        onJump={feeds.onJump}
        onLoaded={feeds.onActivityLoaded}
      />
    );
  }
  if (view === "saved") {
    return (
      <SavedFeed
        user={feeds.user}
        users={feeds.users}
        customEmojis={feeds.emojis}
        onJump={feeds.onJump}
        onUnsave={feeds.onUnsave}
      />
    );
  }
  if (!conversation.channel || (view !== "home" && conversation.channel.type !== "dm")) {
    return (
      <div className="empty-pane">
        {view === "dms" ? "Select a conversation, or start a new one." : "Search to start a conversation."}
      </div>
    );
  }

  const { channel, ...props } = conversation;
  return <ChannelView key={channel.id} channel={channel} {...props} />;
}
