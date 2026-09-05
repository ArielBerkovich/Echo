# Activity read state

Activity reads are independent of channel/DM and thread unread counters. A
source message must be at least half visible for 500 ms in a visible browser
tab. Visibility is clipped to its scroll containers and the viewport; an
overlay covering its visible center prevents acknowledgment. For messages
taller than the available viewport, half of the available height suffices.

Only messages in the conversation timeline or thread panel qualify. Viewing
Activity previews, search results, or saved-message previews does not read
message activity. Channel-add and channel-removal notices have no source
message, so viewing their Activity rows acknowledges them instead.

All currently displayed activity versions for a viewed message are acknowledged
together, including grouped reactions. A later reaction remains unread until
the message is viewed again. Failed requests leave server state unread and
retry while the source remains visible. Successful reads synchronize across
the user's connected sessions.

## Mongo compatibility

No migration command or destructive database operation is required. Before an
existing user's first authenticated request can advance any legacy read marker,
the server atomically initializes `User.activityReadBaseline` with a snapshot
of that user's existing `Read` markers and `activitySeenAt`. Concurrent requests
use the same snapshot. Previously read activity stays read; previously unread
activity stays unread until its source is viewed.

Original messages, activity events, dismissal records, `Read` documents, and
`activitySeenAt` retain their existing formats. Subsequent acknowledgments use
the separate `activityreads` collection, uniquely indexed by user and activity
ID. Its timestamp identifies the acknowledged event version, preventing a stale
request from clearing a newer reaction to the same message.
Both persisted activity events and activity-read records have Mongo TTL indexes
keyed to the activity creation time, so they are physically removed after 30
days. Mongo's TTL monitor runs asynchronously; the API's rolling window hides
them immediately while database cleanup catches up.

`POST /api/activity/read` now accepts
`{ "items": [{ "id": "activity-id", "createdAt": "ISO timestamp" }] }`.
The endpoint validates each entry against the authenticated user's accessible
feed. The old bodyless request no longer marks the whole feed read.

## Local verification

With the repository's Docker Compose services running at localhost:8090:

```sh
cd client
ECHO_TEST_MONGO=1 npx playwright test --config playwright.local-stack.config.ts \
  activity-reads.spec.ts activity-reactions.spec.ts activity-mongo-compatibility.spec.ts
```

The Mongo compatibility test explicitly opts into the local Compose `echo`
database and constructs legacy records only for its generated test account.
