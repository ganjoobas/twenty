# WSChat bridge

Server-to-server endpoints that let WSChat act as the only way into this CRM.
Not part of upstream Twenty.

## Switch

`WSCHAT_BRIDGE_SECRET` (env only). Empty or shorter than 32 characters: the
bridge is off and every route answers `404` exactly like an unknown route.

Every request must carry `X-WSChat-Bridge-Secret: <secret>`. It is compared in
constant time (SHA-256 of both sides, then `timingSafeEqual`). Wrong or missing:
`401` with a generic body. The secret and the header are never logged.

## `POST /wschat-bridge/login-link`

```json
{
  "workspaceId": "<uuid>",
  "email": "<member e-mail, as stored in Twenty>",
  "returnToPath": "/objects/people",
  "locale": "ru-RU",
  "colorScheme": "Dark"
}
```

`returnToPath`, `locale`, `colorScheme` are optional.

Response `200`:

```json
{ "url": "https://<workspace host>/verify?loginToken=...", "expiresAt": "<ISO 8601>" }
```

Redirect the member's browser to `url`. The token is single-use and lives
`LOGIN_TOKEN_EXPIRES_IN` (15 minutes by default). It is a regular
`password`-provider login token, so the resulting session is an ordinary one
(no impersonation banner). The URL is built with `WorkspaceDomainsService`, so
custom domains and subdomains are honoured.

| Status | When |
| --- | --- |
| 400 | Body invalid (`workspaceId` not a UUID, bad e-mail, `returnToPath` not a single-slash relative path, unknown `locale` / `colorScheme`) |
| 401 | Secret header missing or wrong |
| 404 | Bridge off, or workspace / user / membership not found, or workspace still being created (one generic message) |
| 409 | `IS_EMAIL_VERIFICATION_REQUIRED` is on and the user's e-mail is not verified (the token exchange would reject it) |

Suspended or inactive workspaces still get a link: Twenty's own token exchange
accepts them and its front-end shows the suspended screen. If the workspace
enforces 2FA, the member goes through Twenty's 2FA step after the redirect.

### `locale` and `colorScheme`

When present they are saved on the member before the token is issued, so the
app opens already in that language and theme. The writes are the same as the
`updateWorkspaceMemberSettings` mutation: `workspaceMember.locale` /
`workspaceMember.colorScheme` in the workspace schema, plus
`core.userWorkspace.locale` for the locale. `core.user.locale` is not touched
(the mutation does not touch it either).

- `locale`: a key of `APP_LOCALES` from `twenty-shared/translations`, e.g. `en`,
  `ru-RU`, `uk-UA`, `uz-UZ`, `zh-CN`.
- `colorScheme`: `Light`, `Dark` or `System`.

Unknown values are rejected with `400` listing the allowed values. If saving
fails for any other reason, a warning is logged and the link is still issued:
the member just keeps their previous language or theme.

## Workspaces and members

Endpoints under `/wschat-bridge/workspaces` let WSChat run a CRM workspace for
each client company with no Twenty sign-up, invitation e-mail, password or
onboarding screen. Same secret header, same `404` when the bridge is off. They
need no Twenty session: each step calls the upstream service method directly,
with Twenty's system auth context where a method checks permissions.

Every error body has a stable `code`:

```json
{ "statusCode": 409, "error": "Conflict", "message": "...", "code": "SUBDOMAIN_TAKEN" }
```

Body validation errors are `400` with `code: "INVALID_INPUT"` and `message` as
an array (Nest's usual shape). Guard answers (`401`, the bridge-off `404`) keep
their plain shape, without `code`.

Shared fields: `locale` is a key of `APP_LOCALES` (see above), `colorScheme` is
`Light`/`Dark`/`System`, `firstName` is non-blank, `firstName`/`lastName` are at
most `WORKSPACE_MEMBER_NAME_MAX_LENGTH` characters. E-mails are trimmed and
lowercased. A member object in responses:

```json
{ "email": "a@b.c", "firstName": "A", "lastName": "B", "role": "admin", "isDisabled": false }
```

`role` is `admin` or `member` for the standard roles (matched by universal
identifier, not by label), the label of a custom role, or `null` if none.

### `POST /wschat-bridge/workspaces` → `201`

```json
{
  "displayName": "Taxi 555",
  "subdomain": "taxi555",
  "admin": { "email": "boss@taxi555.kg", "firstName": "Aibek", "lastName": "", "locale": "ru-RU", "colorScheme": "Light" },
  "allowedEmbeddingOrigins": ["https://wschat.org"]
}
```

Response: `{ "workspaceId": "<uuid>", "subdomain": "taxi555", "url": "https://taxi555.<base>/" }`.

Order of work:

1. Refusals first, before any write: `IS_MULTIWORKSPACE_ENABLED` (a first
   workspace on an empty instance is always allowed, as upstream), subdomain
   format (lowercase `a-z0-9-`, at most 30 characters, not starting with
   `api-`), reserved names (`RESERVED_SUBDOMAINS`, `DEFAULT_SUBDOMAIN`,
   `ADDITIONAL_RESERVED_SUBDOMAINS`), subdomain already used (soft-deleted
   workspaces included), embedding origins (syntax, at most 20).
2. The admin's `core.user` is reused when the e-mail exists, otherwise created
   like an SSO sign-up: no password hash at all, e-mail verified, never a server
   admin.
3. `SignInUpService.signUpOnNewWorkspace` creates the workspace row, its custom
   application and the admin's membership in one transaction, and applies the
   upstream workspace-count limit (`WORKSPACE_LIMIT_REACHED`). The only upstream
   rule skipped is `IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS`: the bridge
   is the authority. Nobody gets server-admin flags.
4. `WorkspaceService.activateWorkspace` builds the schema, standard objects,
   views and roles, the admin's workspace member and Admin role, as the normal
   onboarding does. Status is `ACTIVE` (with billing on, a `CREATED` workspace
   is reactivated to `ACTIVE`, otherwise the onboarding cleaner would delete it
   after 7 days).
5. `isPublicInviteLinkEnabled = false`, `isPasswordAuthEnabled = false`,
   embedding origins, the admin's name/locale/theme, e-mail verified, every
   onboarding step cleared: the admin lands straight in the app via a login
   link (the login-token exchange does not look at `isPasswordAuthEnabled`).

Guarantee: if any step after the workspace row exists fails, the workspace is
hard-deleted (the admin panel's deletion path) so it does not keep the
subdomain, and the call answers with the original refusal code or
`WORKSPACE_CREATION_FAILED`. If that deletion fails too, the answer is `500
WORKSPACE_CREATION_FAILED` naming the workspace id, which then needs manual
removal. Side effect of the clean-up: a `core.user` created by this call (or one
with no other workspace) ends up soft-deleted, as upstream does; a retry creates
a fresh one.

### `GET /wschat-bridge/workspaces/:workspaceId` → `200`

```json
{ "workspaceId": "...", "displayName": "...", "subdomain": "...", "url": "...", "activationStatus": "ACTIVE", "members": [ ... ] }
```

`404 WORKSPACE_NOT_FOUND` for an unknown or soft-deleted workspace. A workspace
still being created is returned with no members.

### `PATCH /wschat-bridge/workspaces/:workspaceId` → `200`

Body: any of `displayName`, `subdomain`, `allowedEmbeddingOrigins` (the full
new list; `[]` clears it). Validation as in `POST`, all before the first write.
Name and subdomain go through `updateWorkspaceById` (custom-domain bookkeeping
and caches as upstream); origins through the per-origin upstream method,
removals first. Response: the workspace as in `GET`. Changing the subdomain
changes `url`; links issued before keep pointing at the old host.

### `PUT /wschat-bridge/workspaces/:workspaceId/members` → `200`

Body: `{ email, firstName, lastName, role: "admin" | "member", locale?, colorScheme? }`.

Idempotent upsert: creates the user if absent (as above), adds the membership
through upstream's join path (seat limit, workspace member, role) if absent,
sets the role, writes the name (always) and locale/theme (only when given),
verifies the e-mail and clears onboarding. Repeating a call that failed half-way
repairs a membership left without its workspace member row. Response: the
member plus `created: true|false`. Demoting the last Admin: `409 LAST_ADMIN`,
nothing changed.

### `DELETE /wschat-bridge/workspaces/:workspaceId/members` → `200`

Body: `{ email }`. Absent user or membership: `{ "removed": false }`.
Otherwise the bridge refuses with `409 LAST_MEMBER` (upstream would suspend and
delete the whole workspace) or `409 LAST_ADMIN`, then calls
`UserService.deleteUserWorkspaceAndPotentiallyDeleteUser`, the
`deleteUserFromWorkspace` mutation's own path: records/views/connected accounts
pass to a successor, the member and membership are removed, and the user is
soft-deleted if this was their last workspace. `{ "removed": true }`.

### Error codes

| Status | Code | When |
| --- | --- | --- |
| 400 | `INVALID_INPUT` | Body or path parameter invalid |
| 400 | `SUBDOMAIN_INVALID` | Subdomain format |
| 400 | `EMBEDDING_ORIGIN_INVALID` | An origin is not `http(s)://host[:port]` |
| 400 | `TOO_MANY_EMBEDDING_ORIGINS` | More than 20 distinct origins |
| 403 | `WORKSPACE_CREATION_RESTRICTED` | Upstream admin-only creation rule fired (not expected) |
| 404 | `WORKSPACE_NOT_FOUND` | Unknown or deleted workspace |
| 404 | `MEMBER_NOT_FOUND` | Member vanished while answering (not expected) |
| 409 | `MULTIWORKSPACE_DISABLED` | `IS_MULTIWORKSPACE_ENABLED` off and a workspace exists |
| 409 | `WORKSPACE_LIMIT_REACHED` | Upstream cap without an enterprise key (`MAX_WORKSPACES_WITHOUT_ENTERPRISE_KEY`) |
| 409 | `SUBDOMAIN_RESERVED` | Reserved subdomain |
| 409 | `SUBDOMAIN_TAKEN` | Subdomain used by another workspace, deleted ones included |
| 409 | `WORKSPACE_NOT_READY` | Workspace still `PENDING_CREATION` / `ONGOING_CREATION` (PUT, DELETE, PATCH) |
| 409 | `LAST_ADMIN` | Demoting or removing the last Admin |
| 409 | `LAST_MEMBER` | Removing the last member |
| 409 | `LAST_SERVER_ADMIN` | Removing the instance's last server admin from their last workspace |
| 409 | `SEAT_LIMIT_REACHED` | Billing seat limit (billing on only) |
| 409 | `ROLE_NOT_FOUND` | The standard Admin/Member role is missing |
| 409 | `ROLE_NOT_ASSIGNABLE` | Role cannot be assigned to users / not entitled |
| 409 | `MEMBER_ROLE_MISSING` | Member has no role, so the last-admin check cannot run |
| 500 | `WORKSPACE_CREATION_FAILED` | Creation failed and was rolled back, or clean-up failed (message names the id) |
| 500 | `INTERNAL_ERROR` | Anything else; details only in the server log |

Each mutating call logs one line: workspace id, action, masked e-mail.
