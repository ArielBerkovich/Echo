# Echo Groups

## Product decision

Echo will have application-owned **Groups**. The existing RHSSO directory
groups will no longer power the Groups view, group browser, or group mentions.
RHSSO can remain available for authentication, but its external groups are out
of scope for this feature.

A Group is a collaborative collection of Echo users that can:

- be created by any authenticated user;
- contain Echo users as members;
- have Echo channels assigned to it for organization and discovery; and
- be mentioned in messages with `@group`-style suggestions and notifications.

Every group member can add another Echo user to the group or remove a member.
The creator is the initial member and owner for lifecycle actions such as
editing the group identity or deleting it. Ownership can be transferred.
Workspace admins can delete any Group.

An active Group must have at least one member and exactly one owner. Any user
can leave a Group. If the departing user is the owner and other members
remain, leaving must transfer ownership to a selected remaining member. If the
departing user is the last member, the Group is archived automatically.

### Channel access assumption

Assigning a channel to a Group organizes the channel under that Group but does
not silently change the channel's existing membership or privacy in the first
iteration. This avoids unexpectedly exposing private conversations. A later
iteration can add an explicit “add all Group members” or auto-join setting.

## MVP behavior

- Any authenticated user can create a Group.
- A Group has a display name, stable handle, optional description, members,
  and assigned channels.
- Group members can add or remove Echo users, and any member can leave.
- The owner can edit the name, handle, description, and channel assignments,
  transfer ownership, or delete the Group. Workspace admins can delete any
  Group.
- Group members can browse the Group and its assigned channels.
- A member can mention the Group anywhere they can post a message.
- A Group mention notifies current members once per message and appears in
  their Activity feed.
- An archived or deleted Group leaves historical mention metadata readable but
  no longer resolves as an active mention target.

The MVP excludes nested Groups, email invitations, approval workflows, group
DMs, external-directory synchronization, and automatic channel membership.

## Existing code to reuse or remove

The current implementation has an external-directory abstraction:

- `server/src/groupDirectory.ts` and `server/src/routes/groups.ts` expose
  RHSSO groups;
- `client/src/components/GroupsPanel.tsx` renders read-only directory groups;
- `Composer.tsx`, message rendering, delivery, and activity already support
  group mentions;
- `rhssoDirectory.ts` fetches groups and members from Keycloak/RHSSO.

Keep the mention and delivery concepts, but replace the RHSSO provider path
with application-owned Group queries. Remove the requirement that a group must
have an RHSSO provider or an external ID. The public API can temporarily keep
`provider: "echo"` for message compatibility, but new endpoints should make
the ownership clear and should not expose RHSSO groups.

## Data model

### `Group`

```text
_id
name             required, trimmed, 1–80 characters
handle           required, lowercase, 2–32 characters, unique
description      optional, trimmed, max 280 characters
owner            User reference
createdBy        User reference
createdAt        timestamp
updatedAt        timestamp
archivedAt       nullable timestamp
archivedBy       nullable User reference
deletedAt        nullable timestamp for safe historical references
```

### `GroupMembership`

```text
group            Group reference
user             User reference
role             "owner" | "member"
createdAt        timestamp
updatedAt        timestamp
```

### `GroupChannel`

```text
group            Group reference
channel          Channel reference
createdAt        timestamp
createdBy        User reference
```

Add unique compound indexes on `{ group, user }` and `{ group, channel }`, an
index on `{ user, group }`, and a unique index on `handle`. Keep memberships
and channel assignments separate from the Group document so they remain
manageable and independently auditable.

Group list responses should include `id`, `name`, `handle`, `description`,
`memberCount`, `channelCount`, a compact member summary (display name, avatar,
and ID), public channel summaries, and the current user's membership/role.
Private channel details must still be filtered per requesting user.

## API shape

All endpoints require authentication. The server must enforce membership and
owner checks; hiding a button in the client is not authorization.

```text
GET    /api/groups
POST   /api/groups                         any authenticated user
GET    /api/groups/:id                     discoverable Group summary
PATCH  /api/groups/:id                     owner
DELETE /api/groups/:id                     owner or workspace admin

GET    /api/groups/:id/members             member
POST   /api/groups/:id/members             member
DELETE /api/groups/:id/members/:userId     member, or self-leave
POST   /api/groups/:id/transfer            owner
POST   /api/groups/:id/leave               current member

GET    /api/groups/:id/channels            member
POST   /api/groups/:id/channels            owner
DELETE /api/groups/:id/channels/:channelId owner
```

Adding an existing member should be idempotent. Validate that users and
channels exist, normalize handles before uniqueness checks, and return
consistent `400`, `403`, and `404` errors. A member removal should not delete
the user's messages or alter the channel's own membership.

## UI flow

Keep **Groups** in the existing More menu and Groups workspace, but replace the
directory-only copy with collaborative controls:

1. Add `Create group` to the Groups header and empty state.
2. Create a modal for name, handle, and description.
3. Show each Group's members and assigned channels in its detail panel.
4. Let any member open an Add members flow and remove members with explicit
   confirmation.
5. Let the owner edit group details, attach/detach channels, transfer
   ownership, and delete the Group.
6. Add channel search to the channel-assignment flow; show private channels
   only when the current user already has access to them.
7. When an owner leaves, require a replacement owner if other members remain;
   archive automatically when the last member leaves.
8. Label the entity `Group` and remove the RHSSO/provider label from the user
   experience.

The Groups view should show a summary card or row for every discoverable Group,
including its member list or avatars and assigned channels. Group membership
and channel associations should be visible without opening a separate detail
screen. The view should support searching Groups and expanding a Group for the
full member/channel lists.

The initial discovery policy is workspace-visible Groups. Public channel
associations can be shown to everyone; private channel names and links are
shown only to users who can already access those channels. A Group's member
list is visible in the Groups view, while member management controls remain
available only to Group members.

## Mentions and delivery

Use a stable Group ID in mention metadata rather than relying on the mutable
handle. The composer should suggest Groups the sender can mention. At send
time, resolve the Group to the current member IDs, excluding the sender and
users who cannot receive the message.

Store the resolved Group identity and member snapshot on the message/activity
record, as existing external group mentions do. This keeps old messages
readable after a rename, membership change, or deletion.

Do not send duplicate notifications when a message mentions both a user and a
Group containing that user. Preserve the existing channel/DM permission checks
before delivering a Group notification.

## Permissions and lifecycle

- Group creation is available to every authenticated user.
- The owner controls Group metadata, channel assignments, deletion, and
  ownership transfer.
- Workspace admins can delete any Group, including one they do not belong to.
- Every member can add or remove members, as requested.
- Any member can leave. An owner leaving with other members must transfer
  ownership as part of the same operation.
- When the last member leaves, archive the Group automatically rather than
  deleting it. Archived Groups are hidden from active lists and cannot be
  mentioned or modified by ordinary users.
- Workspace admins can restore or permanently delete archived Groups.
- Removing a user from a Group does not remove them from assigned channels.
- Archiving or deleting a Group removes active memberships and assignments but
  preserves historical mention metadata.
- Rate-limit Group creation and bulk membership changes.
- Remove or anonymize memberships when a user is deleted.

## Edge cases and invariants

### Membership races

- Enforce one membership row per `{ group, user }` with a database unique
  index; concurrent add requests should produce one member, not duplicates.
- Perform owner departure, replacement-owner assignment, and last-member
  archive in one transaction or with an optimistic version check. A stale
  browser must not be able to restore an owner who has already left.
- If a member removes the current owner, the same operation must assign a new
  owner (the remover by default, or an explicitly selected remaining member);
  no successful mutation may leave an active Group ownerless.
- Removing the last member through an admin action follows the same automatic
  archive path as a self-leave.
- A member who is removed while viewing the Group should lose management
  controls immediately and receive a clear “You are no longer a member” state.
- Adding an already active member is idempotent; adding a deleted, suspended,
  or otherwise ineligible account returns a clear validation error.

### Archived and deleted Groups

- Archived Groups are excluded from active list results, autocomplete, and new
  message mention resolution, but their old messages retain a non-clickable
  historical label.
- Restoring an archived Group requires a workspace admin to select or create
  an owner and at least one member. Restore must fail safely if the old owner
  no longer exists.
- Restoring must revalidate the handle and channel references; a handle may
  have been reused and a channel may have been deleted or become inaccessible.
- Archive and delete operations are idempotent. Repeating either operation
  must not duplicate audit records or fail because the Group is already in the
  target state.
- Permanent deletion should be a separate, explicit admin action and should
  remove active membership/assignment data without rewriting message history.

### Channels and privacy

- A user may assign only channels they can already access. Assigning a private
  channel must never make it visible to other Group members automatically.
- If an assigned channel is deleted, archived, or made inaccessible, retain a
  tombstone or remove the association and show a non-clickable “Channel
  unavailable” entry to authorized Group viewers.
- Detaching a channel must not delete the channel or change its membership.
- A message mentioning a Group must notify only members who can receive the
  message in that channel; membership alone must not bypass channel privacy.
- If a Group is mentioned multiple times, or alongside a direct mention, each
  recipient receives one notification and one Activity item for that message.

### Identity and discovery

- Group IDs, not handles, identify mentions and historical records. Renaming a
  Group changes suggestions and display text without breaking old messages.
- Handle uniqueness must be case-insensitive and reserved during an active
  rename transaction. Decide whether archived handles remain reserved before
  implementing restore.
- Group list and search results must paginate members and channels; never load
  an unbounded workspace-wide member list into one response.
- Member and channel summaries must be filtered per requester so a Group view
  cannot disclose private channel names or user data they could not otherwise
  access.

### Administration and audit

- Admin deletion must be authorized server-side even when the admin is not a
  Group member, and the UI must clearly label it as an administrative action.
- Record actor, target Group, previous owner, affected members/channels, and
  reason/source for create, membership changes, ownership transfer, archive,
  restore, and permanent delete.
- Bulk member changes should have bounded request sizes, rate limits, and
  predictable partial-failure behavior; prefer all-or-nothing batches for the
  initial implementation.

## Implementation sequence

1. Add `Group`, `GroupMembership`, and `GroupChannel` models with indexes and
   tests.
2. Add authenticated list/detail/create/update/delete and membership routes.
3. Add channel assignment routes with channel visibility checks.
4. Replace the RHSSO-backed Groups panel with the Echo Groups UI.
5. Update composer suggestions and mention resolution to use Echo Groups only.
6. Update delivery/activity deduplication and historical rendering.
7. Add browser coverage for create, collaborative membership, channel
   assignment, mention delivery, ownership transfer, leave, and delete.
8. Remove RHSSO group-directory code and stale tests once no other feature
   depends on it.

## Decisions still needed

- Should all Groups be discoverable by name, or should private Groups be
  invite-only?
- Should a Group member be allowed to assign/detach channels, or owner-only as
  proposed here?
- Should adding a channel optionally add all Group members to that channel?
- Should a Group support multiple owners instead of one transferable owner?
