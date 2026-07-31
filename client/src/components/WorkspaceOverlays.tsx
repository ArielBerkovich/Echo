import { BUILT_IN_GIT_EMOJIS } from "../lib/gitEmojis.js";
import AddEmojiModal from "./AddEmojiModal.js";
import AddPeopleModal from "./AddPeopleModal.js";
import ApiDocsPage from "./ApiDocsPage.js";
import CreateChannelModal from "./CreateChannelModal.js";
import SettingsModal from "./SettingsModal.js";
import NewMessageModal from "./NewMessageModal.js";
import UserProfileModal from "./UserProfileModal.js";
import Walkthrough from "./Walkthrough.js";

export default function WorkspaceOverlays({
  user,
  users,
  activeChannel,
  customEmojis,
  onlineIds,
  vipIds,
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
  onAddMember,
  onEmojiCreated,
  onSelectTheme,
  onSelectMode,
  onUserUpdated,
  onToggleVip,
  onOpenDm,
  onReplayTour,
  onFinishTour,
  onClose,
}) {
  const canAddPeople = activeChannel && activeChannel.type !== "dm" && activeChannel.name?.toLowerCase() !== "general";

  return (
    <>
      {showCreate ? <CreateChannelModal onCreate={onCreateChannel} onClose={onClose.create} /> : null}
      {showNewMessage ? (
        <NewMessageModal
          currentUserId={user.id}
          users={users}
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
          onReplayTour={onReplayTour}
        />
      ) : null}
      {showApiDocs ? <ApiDocsPage onClose={onClose.apiDocs} /> : null}
      {profileUser ? (
        <UserProfileModal
          user={profileUser}
          currentUserId={user.id}
          online={onlineIds.has(profileUser.id)}
          isVip={vipIds.has(profileUser.id)}
          onToggleVip={() => onToggleVip(profileUser.id)}
          onMessage={onOpenDm}
          onClose={onClose.profile}
        />
      ) : null}
      {showTour ? <Walkthrough onClose={onFinishTour} /> : null}
      {toast ? <div className="toast" role="status" onClick={onClose.toast}>{toast}</div> : null}
    </>
  );
}
