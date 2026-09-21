# Echo Groups

Groups are workspace-owned collections of Echo users. Any authenticated user
can create a group. Members can add or remove members and leave; leaving the
last membership archives the group. Group mentions use the stable group ID.

Group names are limited to 40 characters and may contain English letters,
numbers, spaces, and hyphens.

## REST API

All endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Permission |
| --- | --- | --- |
| `GET` | `/api/groups` | Authenticated user |
| `POST` | `/api/groups` | Authenticated user |
| `GET` | `/api/groups/:groupId` | Authenticated user |
| `GET` | `/api/groups/:groupId/members` | Group member |
| `POST` | `/api/groups/:groupId/members` | Group member |
| `DELETE` | `/api/groups/:groupId/members/:userId` | Group member |
| `POST` | `/api/groups/:groupId/leave` | Group member |
| `DELETE` | `/api/groups/:groupId` | Group owner or workspace admin |

Create a group with:

```json
{
  "name": "Product Design",
  "description": "Optional description",
  "memberIds": ["user-id"]
}
```

Add a member with `{ "userId": "user-id" }`. Adding an existing member is
idempotent. Member mutations return the updated group summary; member listing
returns `{ "members": [...] }`.
