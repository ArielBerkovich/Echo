import { lazy, Suspense, useRef } from "react";
import { useI18n } from "../lib/i18n.js";

// Conversation history, feeds, and browse/search results pull in markdown,
// sanitization, and message interaction code. Load each surface when selected
// so the navigation shell can become interactive without that graph.
const ActivityFeed = lazy(() => import("./ActivityFeed.js"));
const ChannelBrowser = lazy(() => import("./ChannelBrowser.js"));
const ChannelView = lazy(() => import("./ChannelView.js"));
const GroupsPanel = lazy(() => import("./GroupsPanel.js"));
const SavedFeed = lazy(() => import("./SavedFeed.js"));
const SearchResults = lazy(() => import("./SearchResults.js"));
const SettingsModal = lazy(() => import("./SettingsModal.js"));

export default function WorkspaceContent({ view, groups, search, browse, feeds, conversation, channelViewRef }) {
  const { t } = useI18n();
  const activeChannel = conversation.channel;

  return (
    <div className="chat-pane">
      <ActiveWorkspaceView
        view={view}
        groups={groups}
        search={search}
        browse={browse}
        feeds={feeds}
        conversation={conversation}
        channelViewRef={channelViewRef}
        t={t}
      />
    </div>
  );
}

function ActiveWorkspaceView({ view, groups, search, browse, feeds, conversation, channelViewRef, t }) {
  let content;
  if (groups) {
    content = <GroupsPanel {...groups} />;
  } else if (search.query) {
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
        {view === "dms" ? t("selectConversation") : t("searchToStartConversation")}
      </div>
    );
  } else {
    const { channel, ...props } = conversation;
    content = <ChannelView ref={channelViewRef} key={channel.id} channel={channel} {...props} />;
  }

  return <Suspense fallback={<div className="empty-state"><p>{t("loading")}</p></div>}>{content}</Suspense>;
}
