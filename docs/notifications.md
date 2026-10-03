# Notification rules

Echo stores notification preferences per user, so they follow the user across
their clients. Notification rules control desktop notifications; they do not
change message delivery, unread indicators, or read state. A notification is
also suppressed while Echo is focused on the conversation receiving it.

## Global default

Set the default under **Settings → Preferences → Notifications**:

| Default | Channels and group DMs |
| --- | --- |
| **Mentions in channels, all direct messages** | Notify when you are mentioned in channels. `@everyone` also notifies channel members. Notify for every one-to-one DM. |
| **All messages** | Notify for every message in channels and group DMs. One-to-one DMs already notify by default. |

## Conversation overrides

A channel or DM can have its own rule from the bell menu in that conversation's
header. A conversation rule takes precedence over the global default:

| Override | Effect |
| --- | --- |
| **Use default** | Remove this override and inherit the global rule. |
| **All messages** | Notify for every message in this conversation. |
| **Mentions only** | Notify only when you are mentioned. This option is available for channels and group DMs; one-to-one DMs already notify by default. |
| **Mute conversation** | Suppress notifications for the conversation. Personal mentions do not bypass a conversation mute. |

Overrides appear under **Conversation overrides** in notification preferences,
where each one can be reset to the global default. Muting affects notifications
only; unread markers and read state continue to work normally.

## Thread overrides

Thread notifications are set separately for each thread from its thread
header. They are also per-user:

- **Follow thread:** notify for every reply, even if the conversation is muted
  or set to mentions only.
- **Turn off thread notifications:** mute ordinary replies in that thread,
  including when the conversation is set to **All messages**. A personal
  mention in the thread still notifies unless the containing conversation is
  muted.
- **No thread override:** replies use the containing conversation's effective
  rule (its own override, or the global default if set to **Use default**).

Changing thread or conversation notification rules never changes unread
indicators or message read state.
