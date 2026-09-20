# Echo-owned user groups

## Goal

Allow people to create and manage user groups from inside Echo. A group is a
workspace-level collection of Echo users that can be browsed, mentioned in
messages, and used as a recipient for group notifications. Existing RHSSO
groups remain visible and mentionable, but stay directory-managed and
read-only in Echo.

## Proposed MVP

- Any authenticated user can create a group.
- The creator becomes the owner and the first member.
- A group has a display name, a stable handle, an optional description, and a
  member list.
- Owners can add and remove Echo users, edit group details, and delete the
  group.
- Members can browse the group and mention it in channels where they can
  already post.
- A group mention notifies current Echo members once per message and appears
  in their Activity feed.
- A user can leave a group. The owner must transfer ownership or delete the
  group before leaving.
- Membership is private to the group: non-members can see the group name only
  where product surfaces already expose it, not its member list.

The MVP intentionally excludes invitations by email, nested groups, group
DMs, approval workflows, and automatic synchronization with RHSSO.

## Reuse the existing group boundary

The current code already models external groups with a provider-qualified
identity such as `rhsso:<id>`:

- `server/src/groupDirectory.ts` provides the provider-neutral list/detail/member contract.
- `server/src/routes/groups.ts` exposes authenticated group browsing.
- `client/src/components/GroupsPanel.tsx` renders the list and member detail view.
- Composer mention suggestions and message rendering already understand group mentions.
- Server delivery and activity code already resolves group members at send time.

Add an Echo provider rather than creating a separate feature path:

```text
provider: "echo"
id: <Group ObjectId>
```

The provider can return the same public shape as RHSSO groups. The existing
mention wire format can then remain provider-qualified:

```text
@group.echo.<group-id>
```

Keep the legacy RHSSO format working during migration.

## Data model

Add two application-owned models.

### `UserGroup`

```text
_id
name             required, trimmed, 1–80 characters
handle           required, lowercase, 2–32 characters, unique
description      optional, trimmed, max 280 characters
owner            User reference
createdBy        User reference
createdAt        timestamp
updatedAt        timestamp
```

### `UserGroupMembership`

```text
group            UserGroup reference
user             User reference
role             "owner" | "member"
createdAt        timestamp
updatedAt        timestamp
```

Add a unique compound index on `{ group, user }`, an index on `{ user, group }`,
and a unique index on `handle`. Keep membership separate from `User` so group
membership changes do not make the user document grow without bound and so
future roles/audit records have a natural home.

Public group responses should include `id`, `provider`, `name`, `handle`,
`description`, `memberCount`, and the current user's membership/role. Do not
return the full member list from the list endpoint.

## API shape

All endpoints require authentication. Authorization is enforced on the server,
not only by hiding controls in the client.

```text
GET    /api/groups
POST   /api/groups
GET    /api/groups/echo/:id
PATCH  /api/groups/echo/:id              owner
DELETE /api/groups/echo/:id              owner
GET    /api/groups/echo/:id/members      member
POST   /api/groups/echo/:id/members      owner
DELETE /api/groups/echo/:id/members/:uid owner, or self-leave
POST   /api/groups/echo/:id/transfer     owner
```

Use the existing `groupsRouter` and API client. Validate handles and names on
both sides, normalize handles before uniqueness checks, and return consistent
`400`, `403`, and `404` errors. Member-add should be idempotent; duplicate
membership should not create a second record.

## UI flow

Keep **User groups** in the existing More menu and Groups workspace. Add:

1. A `Create group` action in the Groups header and empty state.
2. A modal with name, handle preview/edit, and description.
3. An owner-only group menu for edit, manage members, transfer ownership, and
   delete.
4. A member picker based on existing Echo users, with search and selected
   members.
5. Member actions for remove and leave, with explicit confirmation for
   destructive operations.
6. Clear badges for `Owner` and `Member`; show `Echo group` instead of the
   RHSSO provider label for application-owned groups.

The group detail screen should continue to show the member list only to group
members. Non-members can see a limited group summary if a mention or search
result links them there, but should not receive member identities.

## Mentions and delivery

At send time, resolve `echo` group mentions to a snapshot of current member
IDs, excluding the sender and users who cannot receive the message. Store the
resolved group metadata on the message/activity record just as existing RHSSO
mentions do. This keeps old messages readable if a group is later renamed or
deleted and prevents membership changes from rewriting history.

Do not send duplicate notifications when one message mentions both a user and
a group containing that user. Preserve the existing DM/channel permission
checks before delivering a group notification.

## Permissions and safety

- Group management is independent of workspace-admin status.
- Owners can manage only groups they own.
- A deleted user is removed from memberships by cleanup or treated as an
  inactive member when queried.
- Deleting a group removes its active membership records but does not erase
  historical message mention metadata.
- Rate-limit group creation and member additions like other user-generated
  resources.
- Audit create, update, membership changes, ownership transfer, and delete in
  the existing server logging/audit pattern if one is available; otherwise add
  a small group-audit model before exposing admin investigations.

## Implementation sequence

1. Add `UserGroup` and `UserGroupMembership` models with model tests and
   indexes.
2. Add the Echo provider implementation and read-only list/detail endpoints;
   verify it renders alongside RHSSO groups.
3. Add create/update/delete/membership endpoints with authorization tests.
4. Extend the Groups panel and add the create/manage member UI.
5. Extend mention suggestions, resolution, delivery deduplication, and
   activity tests.
6. Add browser coverage for create, manage, mention, leave, and delete flows.
7. Verify migration behavior, full server/client checks, and both full-stack
   and host-Vite browser workflows.

## Open decisions before implementation

- Should all authenticated users be allowed to create groups, or should a
  workspace setting restrict creation to admins?
- Should group handles be permanently reserved after deletion?
- Should non-members be able to discover groups through global search?
- Should an owner be able to make multiple owners, or only transfer the one
  owner role?
- Should group mentions be allowed in DMs, or only channels?
