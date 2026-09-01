import { lazy, Suspense } from "react";
import { BUILT_IN_GIT_EMOJIS } from "../lib/gitEmojis.js";

// These surfaces are interaction-driven and are not needed to paint the
// workspace. Keep them out of the initial route chunk until they are opened.
const AddEmojiModal = lazy(() => import("./AddEmojiModal.js"));
const AddPeopleModal = lazy(() => import("./AddPeopleModal.js"));
const ApiDocsPage = lazy(() => import("./ApiDocsPage.js"));
const CreateChannelModal = lazy(() => import("./CreateChannelModal.js"));
const SettingsModal = lazy(() => import("./SettingsModal.js"));
const NewMessageModal = lazy(() => import("./NewMessageModal.js"));
const UserProfileModal = lazy(() => import("./UserProfileModal.js"));
const Walkthrough = lazy(() => import("./Walkthrough.js"));

export default function WorkspaceOverlays({
  user,
  users,
  activeChannel,
  customEmojis,
  onlineIds,
  starredIds,
  theme,
  themes,
  mode,
  showCreate,
  showNewMessage,
  showAddPeople,
  showAddEmoji,
  showSettings,
  showApiDocs,
  profileUser,
  showTour,
  toast,
  onCreateChannel,
  onStartDm,
  onPrepareDm,
  onAddMember,
  onEmojiCreated,
  onSelectTheme,
  onSelectMode,
  onUserUpdated,
  onToggleStarred,
  onOpenDm,
  onOpenApiDocs,
  onFinishTour,
  onClose,
}) {
  const isGroupDm = activeChannel?.type === "dm"
    && (activeChannel.members?.length > 2 || activeChannel.participants?.length > 2);
  const canAddPeople = activeChannel
    && activeChannel.name?.toLowerCase() !== "general"
    && (activeChannel.type !== "dm" || (isGroupDm && (activeChannel.members?.length || activeChannel.participants?.length || 0) < 10));

  return (
    <Suspense fallback={null}>
      {showCreate ? <CreateChannelModal onCreate={onCreateChannel} onClose={onClose.create} /> : null}
      {showNewMessage ? (
        <NewMessageModal
          currentUserId={user.id}
          users={users}
          customEmojis={customEmojis}
          mode={mode}
          onPrepare={onPrepareDm}
          onStart={onStartDm}
          onClose={onClose.newMessage}
        />
      ) : null}
      {showAddPeople && canAddPeople ? (
        <AddPeopleModal channel={activeChannel} users={users} onAdd={onAddMember} onClose={onClose.addPeople} />
      ) : null}
      {showAddEmoji ? (
        <AddEmojiModal
          existing={[...BUILT_IN_GIT_EMOJIS, ...customEmojis]}
          onCreated={onEmojiCreated}
          onClose={onClose.addEmoji}
        />
      ) : null}
      {showSettings ? (
        <SettingsModal
          user={user}
          users={users}
          theme={theme}
          themes={themes}
          onSelectTheme={onSelectTheme}
          mode={mode}
          onSelectMode={onSelectMode}
          onUpdated={onUserUpdated}
          onClose={onClose.settings}
          onOpenApiDocs={onOpenApiDocs}
        />
      ) : null}
      {showApiDocs ? <ApiDocsPage onClose={onClose.apiDocs} /> : null}
      {profileUser ? (
        <UserProfileModal
          user={profileUser}
          currentUserId={user.id}
          online={onlineIds.has(profileUser.id)}
          isStarred={starredIds.has(profileUser.id)}
          onToggleStarred={() => onToggleStarred(profileUser.id)}
          onMessage={onOpenDm}
          onClose={onClose.profile}
        />
      ) : null}
      {showTour ? <Walkthrough onClose={onFinishTour} /> : null}
      {toast ? <div className="toast" role="status" onClick={onClose.toast}>{toast}</div> : null}
    </Suspense>
  );
}
