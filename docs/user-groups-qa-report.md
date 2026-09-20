# Echo Groups QA report

Date: 2026-09-21

Contract under test: [`docs/user-groups-design.md`](./user-groups-design.md)

## Result

Status: **blocked: the available implementation is incomplete and not
integrated**.

The workspace contains a partial implementation, but it is not an end-to-end
feature:

- `server/src/models/Group.ts` adds Group, GroupMembership, and GroupChannel
  schemas with the core uniqueness indexes.
- `server/src/groupDirectory.ts` now queries Echo-owned Groups and resolves
  ObjectId-based mentions, but this helper is not connected to a complete CRUD
  or membership API.
- `server/src/routes/groups.ts` is deleted while `server/src/app.ts` still
  imports it. The running container therefore continues serving the previous
  built route, and a fresh source-based server cannot be considered a valid
  Groups deployment.
- `client/src/components/GroupsPanel.tsx` is read-only, labels the feature
  “User groups”/“Directory-managed”, and still calls the provider-shaped API.
  It has no create, member-management,
  channel-assignment, leave, transfer, archive, restore, or delete controls.
- `client/src/api.ts` has only `listGroups` and the provider-shaped `getGroup`;
  no new Groups mutation endpoints are exposed.

Additional implementation risks found during inspection:

- No route or service enforces owner/member/admin authorization, lifecycle
  transitions, or atomic race handling.
- No restore/permanent-delete path or audit model exists.
- No Group model tests verify schema constraints, indexes, or serialization.
- Mention resolution currently returns all Group members and relies on later
  delivery filtering; it has no sender-aware suggestion or historical-label
  test coverage.
- The existing client composer, message click handling, and Groups panel still
  contain RHSSO/provider assumptions.

The existing group E2E coverage is legacy RHSSO coverage using mocked
`provider: "rhsso"` responses. It cannot validate the new contract.

## Checks run

| Check | Result | Notes |
| --- | --- | --- |
| `cd server && npm test` | PASS | 104 tests, 0 failures; no Groups tests |
| `cd server && npm run typecheck` | PASS with caveat | TypeScript `noCheck` is enabled; it does not prove the deleted route import is valid |
| `cd server && npm run build` | PASS with caveat | Same `noCheck` limitation; do not treat as source integration proof |
| `cd client && npm test` | PASS | 111 tests, 0 failures |
| `cd client && npm run typecheck` | PASS | no type errors |
| `cd client && npm run build` | PASS | existing large-chunk warning only |
| `GET http://localhost:4000/api/health` | PASS | `{"status":"ok"}` |
| unauthenticated `GET /api/groups` | PASS | correctly returns `401` |

These are regression checks for the existing application, not acceptance of
the new Groups feature. The server checks do not exercise the partial Group
schemas/helpers, and the running Docker server is based on a previously built
image rather than the incomplete source changes.

## Acceptance matrix for implementation

The following cases should become executable server/API and Playwright tests
once the feature exists. Every API case must assert both status and persisted
state; UI cases must use visible controls and verify the resulting view.

### Creation and identity

1. Any authenticated user can create a Group with trimmed name, normalized
   lowercase handle, and optional description.
2. Reject missing names, names over 80 characters, invalid/short handles,
   descriptions over 280 characters, and duplicate handles regardless of
   case or surrounding whitespace.
3. The creator is the sole initial member and the sole owner.
4. Concurrent creates using the same handle yield one success and one
   conflict; neither request may produce duplicate Groups.
5. Unauthenticated create/list/detail requests return `401`; malformed IDs
   and unknown Groups return consistent `400`/`404` responses.
6. Group list/detail responses include member and channel counts, compact
   member summaries, current-user membership/role, and no RHSSO provider
   requirement.

### Membership races and permissions

1. A member can add an existing Echo user; a non-member receives `403`.
2. Adding the same user concurrently or repeatedly is idempotent and leaves
   exactly one `{ group, user }` membership row.
3. Adding a deleted, suspended, or unknown user fails validation without a
   partial membership.
4. A member can remove another member; a non-member and an unauthenticated
   caller cannot.
5. Removing the owner transfers ownership atomically to the remover or the
   explicitly selected remaining member. No successful mutation may leave an
   active Group ownerless.
6. Concurrent remove/transfer/leave requests never resurrect a stale owner,
   create two owners, or leave an active Group with zero members.
7. Removing a member does not remove their messages or alter channel
   membership.
8. A removed member’s open UI loses management controls and shows a clear
   “no longer a member” state after refresh/realtime update.

### Leave, transfer, archive, restore, and deletion

1. Any member can leave without changing the Group’s channels.
2. An owner leaving with other members must select a remaining replacement in
   the same operation; cancellation leaves the Group unchanged.
3. The last member leaving archives the Group atomically, records `archivedAt`
   and `archivedBy`, removes active memberships/assignments, and excludes it
   from active lists, autocomplete, and new mention resolution.
4. Repeating leave, archive, and delete operations is idempotent.
5. The owner can delete their Group; a non-owner member cannot.
6. A workspace admin can delete any Group, including one they do not belong
   to, and the server—not merely the UI—enforces this.
7. Archived Groups cannot be modified by ordinary users.
8. An admin can restore an archived Group only after selecting/creating a
   valid owner and at least one valid member. Restore fails safely if the old
   owner was deleted.
9. Restore revalidates handle uniqueness and channel references; reused
   handles, deleted channels, and inaccessible channels do not create partial
   state.
10. Permanent deletion is explicit, admin-only, removes active membership and
    assignment data, and does not rewrite historical message metadata.
11. Audit records contain actor, Group, prior owner, affected members/channels,
    operation, and reason/source without duplicate records on retries.

### Channel assignment and privacy

1. Only the owner can add or remove assigned channels; non-owners receive
   `403` even if they are Group members.
2. Assigning the same channel repeatedly is idempotent and leaves one
   `{ group, channel }` association.
3. A user can assign only a channel they can already access.
4. Assigning a private channel never grants that channel to other Group
   members.
5. Group list/detail/channel responses show private channel names only to
   requesters who can already access those channels; other viewers see no
   private-channel metadata.
6. Public channel associations remain discoverable according to the design.
7. Deleting/archiving or revoking access to an assigned channel produces a
   non-clickable “Channel unavailable” entry or removes the association,
   according to the implementation decision, without leaking its name.
8. Detaching a channel does not delete it or change its membership.

### Mentions, history, delivery, and deduplication

1. Composer suggestions include active Echo Groups the sender can mention and
   exclude archived/deleted Groups and RHSSO-only groups.
2. A mention stores a stable Group ID and a member snapshot, not only the
   mutable handle/provider tuple.
3. Renaming a Group changes new display text/suggestions while old messages
   remain readable with their historical snapshot.
4. Sending a Group mention notifies each eligible current member once and
   creates one Activity item per recipient.
5. The sender is excluded from Group notifications.
6. Repeating the same Group mention in one message does not duplicate
   notifications or Activity items.
7. Mentioning a user directly and through a Group produces one notification
   and one Activity item for that user.
8. In private channels, only members who can receive the message are
   resolved/notified; Group membership alone never bypasses channel access.
9. Archived/deleted Groups no longer resolve in new messages, while old
   messages retain a non-clickable historical label.
10. Group mentions in DMs follow the documented channel/message permission
    policy and do not accidentally broadcast to the workspace.

### UI navigation and disclosure

1. Groups remains reachable from the existing More menu and is labelled
   “Groups”, not “User groups” or “Directory-managed”.
2. The empty state and header expose `Create group` to every authenticated
   user.
3. Every discoverable Group row/card shows its members and assigned channels
   without requiring a separate detail screen; expansion/search reveals full
   lists without unbounded loading.
4. Create, edit, member add/remove, leave, transfer, channel assignment,
   archive/delete, and admin restore controls appear only for authorized
   users, while direct API calls remain protected.
5. Private channel filtering is consistent in list, detail, assignment search,
   and expanded views.
6. A user removed in another session sees the membership-loss state without
   stale owner controls.
7. Navigation between Groups, channels, Activity, and back preserves the
   selected Group and does not expose stale archived/deleted data.
8. Refreshing the Groups route preserves the active view and reloads from the
   server rather than browser-only state.
9. Accessibility checks cover dialog labels, confirmation actions, keyboard
   navigation, focus return, and screen-reader names for member/channel rows.

## Test data and execution plan

Use disposable local accounts created by the existing E2E fixture helpers. Do
not hard-code credentials or mutate the shared workspace with permanent test
data. The implementation test fixture should provision:

- ordinary users Alice, Bob, Carol, and Dave;
- one workspace admin;
- public channels `general` and `project`;
- a private channel visible to Alice/Bob but not Carol/Dave; and
- a deleted/inaccessible channel fixture for tombstone behavior.

Run API/transaction tests serially against an isolated Mongo database. Run
Playwright acceptance tests with one worker because the normal local database
is shared. For race cases, use `Promise.all` against the same Group and assert
database uniqueness and owner invariants afterward. Repeat race cases several
times to reduce false confidence from favorable scheduling.

The first implementation PR should add tests in this order:

1. models/indexes and CRUD/authorization API tests;
2. membership and owner-transition transaction/race tests;
3. channel filtering and private-channel tests;
4. mention snapshot/delivery/activity deduplication tests; and
5. headed and headless Playwright navigation/permission coverage.

## QA exit criteria

QA can sign off only when all matrix sections have executable coverage, the
legacy RHSSO group tests are removed or rewritten for Echo-owned Groups, the
full server/client checks pass, and the regular-user acceptance pass confirms
the Groups view, channel associations, mentions, Activity, archive, restore,
and admin deletion behavior in a clean local workspace.
