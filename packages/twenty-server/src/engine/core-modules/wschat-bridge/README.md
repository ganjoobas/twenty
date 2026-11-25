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

### People are owned by WSChat

Members are defined in WSChat only; a CRM admin cannot add, invite or remove
people or loosen sign-in.

- **Service user.** `WSCHAT_BRIDGE_SERVICE_USER_EMAIL` (env only) names one
  `core.user` (first name `WSChat`, no password, e-mail verified, never a
  server admin) shared by all bridge workspaces. It creates each workspace and
  is the only holder of the standard Admin role there. It is never listed by
  `GET`, refused by `PUT`/`DELETE …/members` and by the login link
  (`409 SERVICE_USER`). When the variable is empty every workspace endpoint
  answers `503 SERVICE_USER_NOT_CONFIGURED`; the login link keeps working.
- **Company-admin role.** Bridge role `admin` is a custom role with the fixed
  universal identifier `fa1f5cda-89e7-4647-9ab5-210407f4aa5b`, label
  `Company admin` unless `adminRoleLabel` (≤ 50 characters) is given. Same
  record and tool access as Admin (read/create/update/soft-delete/destroy all
  records, all tools, all agent chat channels), assignable to users only, and
  exactly these settings flags: `DATA_MODEL`, `WORKFLOWS`, `LAYOUTS`,
  `AI_SETTINGS`. No members, security, workspace, roles or API key settings.
  Members read back as `admin` both on this role and on the standard Admin
  (until `enforce` converts them).
- **Owned settings**, applied at creation and by `enforce` through
  `updateWorkspaceById`: password, public invite link, Google and Microsoft
  sign-in and impersonation off; `email` removed from `editableProfileFields`
  (other entries kept; WSChat identifies people by e-mail).

### `POST /wschat-bridge/workspaces` → `201`

```json
{
  "displayName": "Taxi 555",
  "subdomain": "taxi555",
  "admin": { "email": "boss@taxi555.kg", "firstName": "Aibek", "lastName": "", "locale": "ru-RU", "colorScheme": "Light" },
  "adminRoleLabel": "Администратор компании",
  "allowedEmbeddingOrigins": ["https://wschat.org"]
}
```

Response: `{ "workspaceId": "<uuid>", "subdomain": "taxi555", "url": "https://taxi555.<base>/" }`.

Order of work:

1. Refusals first, before any write: the admin is not the service user,
   `IS_MULTIWORKSPACE_ENABLED` (a first workspace on an empty instance is
   always allowed, as upstream), subdomain format (lowercase `a-z0-9-`, at most
   30 characters, not starting with `api-`), reserved names
   (`RESERVED_SUBDOMAINS`, `DEFAULT_SUBDOMAIN`, `ADDITIONAL_RESERVED_SUBDOMAINS`),
   subdomain already used (soft-deleted workspaces included), embedding origins
   (syntax, at most 20).
2. The service user is found or created.
3. `SignInUpService.signUpOnNewWorkspace` creates the workspace row, its custom
   application and the service user's membership in one transaction, and
   applies the upstream workspace-count limit (`WORKSPACE_LIMIT_REACHED`). The
   only upstream rule skipped is `IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS`.
   Nobody gets server-admin flags.
4. `WorkspaceService.activateWorkspace` builds the schema, standard objects,
   views and roles; the service user becomes the workspace's Admin. Status is
   `ACTIVE` (with billing on, a `CREATED` workspace is reactivated, otherwise
   the onboarding cleaner would delete it after 7 days).
5. Owned settings, embedding origins, the service user's onboarding cleared,
   company-admin role created.
6. The `admin` person is added exactly like `PUT …/members` with role `admin`:
   user reused or created, company-admin role, name/locale/theme, e-mail
   verified, onboarding cleared. They land straight in the app via a login
   link (the login-token exchange looks neither at `isPasswordAuthEnabled` nor
   at `AUTH_PASSWORD_ENABLED`).

Guarantee: if any step after the workspace row exists fails, the workspace is
hard-deleted (the admin panel's deletion path) so it does not keep the
subdomain, and the call answers with the original refusal code or
`WORKSPACE_CREATION_FAILED`. If that deletion fails too, the answer is `500
WORKSPACE_CREATION_FAILED` naming the workspace id, which then needs manual
removal. Side effect of the clean-up: upstream soft-deletes the `core.user` of
every member with no other workspace, the service user included when it was
its first workspace; the next call creates a fresh row for the same e-mail.

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

### `POST /wschat-bridge/workspaces/:workspaceId/enforce` → `200`

Body: `{ "adminRoleLabel"?: string }`. Brings a workspace to the rules above;
used once for workspaces created before the service user existed and then on
every full sync as drift repair. Every step checks first, so it is safe to
repeat after a failure part-way. It never removes members (WSChat does that
with `DELETE …/members`) and never revokes API keys.

1. Service user becomes a member with the standard Admin role (repairing a
   half-made membership).
2. Company-admin role created or its label, switches and flags re-applied.
3. Every human on the standard Admin role moves to the company-admin role (after
   step 1, so the last-admin rule is not hit). Humans on any other role than
   company admin or Member are left alone and counted.
4. Owned settings re-applied where they drifted.
5. Pending invitations and approved access domains deleted.

Response:

```json
{
  "serviceUserAdded": true,
  "adminRoleCreated": true,
  "adminRoleFlagsFixed": false,
  "convertedAdmins": 1,
  "unexpectedRoles": 0,
  "settingsFixed": ["isPasswordAuthEnabled", "editableProfileFields"],
  "invitationsDeleted": 0,
  "approvedDomainsDeleted": 0,
  "activeApiKeys": 0,
  "sso": "not checked"
}
```

`sso` is always `not checked`: SSO identity providers live in
enterprise-licensed files the bridge does not import.

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
| 409 | `SERVICE_USER` | The e-mail is the service user's (create, member upsert/removal, login link) |
| 409 | `LAST_SERVER_ADMIN` | Removing the instance's last server admin from their last workspace |
| 409 | `SEAT_LIMIT_REACHED` | Billing seat limit (billing on only) |
| 409 | `ROLE_NOT_FOUND` | The standard Admin/Member role is missing |
| 409 | `ROLE_NOT_ASSIGNABLE` | Role cannot be assigned to users / not entitled |
| 409 | `MEMBER_ROLE_MISSING` | Member has no role, so the last-admin check cannot run |
| 500 | `WORKSPACE_CREATION_FAILED` | Creation failed and was rolled back, or clean-up failed (message names the id) |
| 500 | `INTERNAL_ERROR` | Anything else; details only in the server log |

Each mutating call logs one line: workspace id, action, masked e-mail.

`503 SERVICE_USER_NOT_CONFIGURED`: `WSCHAT_BRIDGE_SERVICE_USER_EMAIL` is empty
(all workspace endpoints, not the login link).

## Server settings this design relies on

- `AUTH_PASSWORD_ENABLED=false`: a workspace admin cannot switch password
  sign-in back on (`updateWorkspaceById` refuses it). Bridge login links are
  not affected; the token exchange does not read it.
- `IS_EMAIL_VERIFICATION_REQUIRED=false`: closes the invitation +
  verify-e-mail join path (`verifyEmailAndGetLoginToken`).
- `AUTH_GOOGLE_ENABLED` / `AUTH_MICROSOFT_ENABLED` off.
- No enterprise key (SSO and other enterprise features stay off).
