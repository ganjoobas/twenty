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
- **API role.** Bridge-issued API keys hold a custom role with the fixed
  universal identifier `a2b125d5-8aeb-4272-b482-e27d70e9b3c4`, label `API`:
  read, create/update and soft-delete all records, no destroy, no tools, no
  agent chat channels, no settings flags at all, assignable to API keys only.
  Upstream key creation needs the `ROLES` flag, which no human has here, so
  keys exist only through the endpoints below.
- **Owned settings**, applied at creation and by `enforce` through
  `updateWorkspaceById`: password, public invite link, Google and Microsoft
  sign-in, impersonation and enforced 2FA off; `email` removed from
  `editableProfileFields` (other entries kept; WSChat identifies people by
  e-mail); `workspaceDiscoverability = HIDDEN` (never listed in the
  root-domain picker); `defaultRoleId` = the standard Member role. Iframe
  camera/microphone grants (`iframeMediaPermissions`) are only reported:
  upstream has no service method that clears them.

### `POST /wschat-bridge/workspaces` → `201`

```json
{
  "displayName": "Taxi 555",
  "subdomain": "taxi555",
  "admin": { "email": "boss@taxi555.kg", "firstName": "Aibek", "lastName": "", "locale": "ru-RU", "colorScheme": "Light" },
  "adminRoleLabel": "Администратор компании",
  "locale": "ru",
  "allowedEmbeddingOrigins": ["https://wschat.org"]
}
```

Response: `{ "workspaceId": "<uuid>", "subdomain": "taxi555", "url": "https://taxi555.<base>/", "dataModelReady": true }`.

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
   Then upstream's sample records that `activateWorkspace` inserts (5
   companies, 5 people, 6 opportunities; `prefillCreatedWorkspaceRecords`) are
   deleted for good by their fixed upstream ids, with plain SQL in one
   transaction (no trash, no events). A failure there is only logged. Its two
   sample workflows ("Quick Lead", "Create company when adding a new person")
   are kept but switched off at once, through
   `CoreWorkflowLifecycleWorkspaceService.deactivateCoreWorkflowVersion`, the
   service behind the Deactivate button: upstream ships them ACTIVE, and the
   second one runs on every person WSChat writes (see "Starter layout",
   version 3). The "My First Dashboard" dashboard is kept.
7. Last, and outside the rollback below: the WSChat data model (see "WSChat
   data model", labels in `locale`). If it cannot be finished (above all a
   busy schema, see `SCHEMA_BUSY`), the workspace is kept and the response
   says `"dataModelReady": false`; the caller then repeats `enforce` until it
   reports `"dataModelReady": true`.
8. Only when the data model is ready: the starter layout (see "Starter
   layout", names in `locale`). It never fails the call; what it could not
   do is repeated by `enforce`.

Guarantee: if any of steps 3–6 fails, the workspace is
hard-deleted (the admin panel's deletion path) so it does not keep the
subdomain, and the call answers with the original refusal code or
`WORKSPACE_CREATION_FAILED`. If that deletion fails too, the answer is `500
WORKSPACE_CREATION_FAILED` naming the workspace id, which then needs manual
removal. Side effect of the clean-up: upstream soft-deletes the `core.user` of
every member with no other workspace, the service user included when it was
its first workspace; the next call creates a fresh row for the same e-mail.

### `GET /wschat-bridge/workspaces/:workspaceId` → `200`

```json
{ "workspaceId": "...", "displayName": "...", "subdomain": "...", "url": "...", "activationStatus": "ACTIVE", "assistantsEnabled": false, "members": [ ... ] }
```

`assistantsEnabled`: whether external assistants may connect (see "External
assistants").

`404 WORKSPACE_NOT_FOUND` for an unknown or soft-deleted workspace. A workspace
still being created is returned with no members.

### `PATCH /wschat-bridge/workspaces/:workspaceId` → `200`

Body: any of `displayName`, `subdomain`, `allowedEmbeddingOrigins` (the full
new list; `[]` clears it), `assistantsEnabled` (as in `enforce`; WSChat uses it
to close assistants of a company that switched its CRM off, without a full
`enforce`). Validation as in `POST`, all before the first write.
Name and subdomain go through `updateWorkspaceById` (custom-domain bookkeeping
and caches as upstream); origins through the per-origin upstream method,
removals first. Response: the workspace as in `GET`. Changing the subdomain
changes `url`; links issued before keep pointing at the old host.

### `DELETE /wschat-bridge/workspaces/:workspaceId` → `200`

Body: `{ "confirmSubdomain": "taxi555" }`, which must equal the workspace's
current subdomain (trimmed, any case). Deletes the workspace at once and for
good; nothing is left for upstream's inactivity cleaners.

Refusals, before any write: `404 WORKSPACE_NOT_FOUND` (unknown, or already
deleted: a repeated call answers this, so WSChat can read it as "deleted"),
`409 CONFIRMATION_MISMATCH`, `409 SYSTEM_WORKSPACE` (the workspace named by
`SERVER_ADMIN_WORKSPACE_ID`). A soft-deleted workspace is found and finished.

Order of work:

1. The size of its storage folder is measured (as `…/usage`), then the folder
   is deleted (`FileService.deleteWorkspaceFolder`). Upstream only queues that
   as a `FileWorkspaceFolderDeletionJob`; the queued job still runs and finds
   nothing.
2. Upstream's hard delete, `WorkspaceService.deleteWorkspace(id, false)` (the
   admin panel's path), under its application-uninstall lock (`409
   WORKSPACE_BUSY` while an uninstall runs): every membership is deleted
   (`deleteUserWorkspace`, hard), a member left with no workspace is
   soft-deleted; application uninstall hooks and logic-function resources;
   all syncable metadata (objects, fields, views, roles, agents, …); the schema
   `workspace_…` is dropped (`DROP SCHEMA … CASCADE`, IF EXISTS); the
   workspace and flat-entity caches in Redis are flushed; a custom domain is
   released; the emailing-domain cleanup is queued; the `core.workspace` row is
   deleted, and its foreign keys cascade to the workspace's other core rows
   (API keys, app tokens, assistant grants, applications, invitations, approved
   domains, our `core.keyValuePair` rows, …).
3. Upstream never removes users. Members whose only workspace this was are now
   deleted from `core.user` (cascading their own rows); a user a foreign key
   still holds stays soft-deleted and is counted. Members of other
   workspaces stay. The service user and any server admin
   (`canAccessFullAdminPanel` / `canImpersonate`) are never removed: if
   upstream soft-deleted them, they are restored.

Response:

```json
{ "deleted": true, "workspaceId": "...", "filesBytes": 1048576, "usersRemoved": 3, "usersKept": 1, "usersLeftSoftDeleted": 0 }
```

`filesBytes` is `null` when the storage is not local or could not be measured.

Failure part-way: the folder goes first and upstream's steps can be repeated
(the schema drop is IF EXISTS, deleted memberships are not found again), so
while the `core.workspace` row exists a repeated call finishes the deletion.
Once that row is gone the call answers `404`; what can be left then is only
step 3: members soft-deleted by upstream but not yet removed. Billing is off
here; with billing on, upstream refuses while a subscription is active.

### `GET /wschat-bridge/workspaces/:workspaceId/usage` → `200`

Read-only.

```json
{ "databaseBytes": 8912896, "filesBytes": 1048576, "filesComplete": true, "totalBytes": 9961472, "measuredAt": "<ISO 8601>" }
```

- `databaseBytes`: `pg_total_relation_size` (tables with their indexes and
  TOAST) of every table and materialized view of the workspace schema. The
  workspace's metadata rows in `core` tables are not counted (shared tables,
  no cheap exact split).
- `filesBytes`: regular files under `<STORAGE_LOCAL_PATH>/<workspaceId>`,
  links not followed; `null` with S3 storage. The walk stops after 10 s:
  `filesComplete: false` then, and `filesBytes` is what was counted so far (a
  lower bound). A missing folder is `0`.
- `404 WORKSPACE_NOT_FOUND` for an unknown or deleted workspace.

### `GET /wschat-bridge/workspaces/:workspaceId/members` → `200`

```json
{ "members": [{ "email": "boss@acme.kg", "role": "admin", "service": false, "serverAdmin": false }] }
```

Every current member (soft-deleted users left out), the service user included
and flagged `service`; `role` is `admin` (company admin or standard Admin),
`member` or `other`; `serverAdmin` is `canAccessFullAdminPanel`. Read-only.
Together with `DELETE …/members` this lets WSChat remove members it no longer
has (an old e-mail after a change): `PUT …/members` adds or updates one member
and never removes anyone.

### `POST /wschat-bridge/workspaces/:workspaceId/close-sessions` → `200`

```json
{ "closedMembers": 2, "closedSessions": 3 }
```

Closes every way back in of every member of this workspace except the service
user, including members WSChat does not know: their browser sessions in this
workspace through `UserSessionService.revokeAllSessionsForUser({ workspaceId })`
(the same call as member removal), and their refresh tokens of this workspace
(`core.appToken`, revoked with a reason, so no renewal grace applies).
Sessions and tokens of the same people in other workspaces are not touched.
Idempotent (a second call closes `0`). `404 WORKSPACE_NOT_FOUND` for an
unknown workspace.

- Effect is immediate: a session is resolved on every request and its cache
  entry is deleted by the revocation, so the next request of an open tab is
  refused. An access JWT the browser may hold from a token exchange cannot be
  revoked and lasts at most `ACCESS_TOKEN_EXPIRES_IN` (30 minutes by default).
- Not touched: API keys (WSChat's own and the company's), workflows (they run
  as their application, not as a member session), and assistants' OAuth
  grants (closed by `assistantsEnabled`).

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
Just before that call the member's sessions in this workspace are revoked
(`UserSessionService.revokeAllSessionsForUser`): session rows cascade-delete
with the membership and would otherwise leave their cached tokens behind. A
failure there is logged and does not stop the removal; access ends anyway,
since every request checks live membership.

### `POST /wschat-bridge/workspaces/:workspaceId/members/reset-two-factor` → `200`

Body: `{ email }`. Deletes the member's two-factor methods in this workspace
and revokes their backup codes, the same writes as Twenty's own "remove
two-factor method". `{ "reset": true }` when a method existed, `false` when
there was none or the person is not a member. The service user is refused
(`409 SERVICE_USER`).

### `GET /wschat-bridge/workspaces/:workspaceId/api-keys` → `200`

Active (not revoked) keys holding the API role:
`[{ "id", "name", "expiresAt", "createdAt" }]` (ISO dates).

### `POST /wschat-bridge/workspaces/:workspaceId/api-keys` → `201`

Body: `{ "name": "1..100, non-blank", "expiresAt"?: "<ISO date in the future>" }`.
Without `expiresAt` the key gets Twenty's own "Never" (now + 100 years; the
column cannot be empty). Response `{ "id", "name", "expiresAt", "token" }`:
the token is returned once, never stored or logged by the bridge, and cannot
be read again. At most 20 unexpired API-role keys per workspace
(`409 API_KEY_LIMIT_REACHED`). The API role is created on first use.

### `DELETE /wschat-bridge/workspaces/:workspaceId/api-keys/:apiKeyId` → `200`

Revokes the key (it stays listed in Twenty as revoked). Only API-role keys of
this workspace; anything else answers `{ "revoked": false }`. WSChat's own key
answers `409 SERVICE_KEY`.

The company-facing key endpoints never show or count WSChat's own key, and
refuse its name: a company key named `WSChat` (any case, trimmed) answers
`409 RESERVED_KEY_NAME`.

### `POST /wschat-bridge/workspaces/:workspaceId/service-key` → `201`

WSChat's own key for the records API: API role, name `WSChat` (records it
writes show `WSChat` as author), 100-year expiry. Response
`{ "id", "token", "expiresAt" }`; the token is returned once. Each call
rotates: the new key is created first, then every previous `WSChat` key is
revoked, so WSChat is never left without a working key (a failed revoke leaves
an extra valid key that the next rotation removes). `enforce` never revokes
it, since it holds the API role.

### `POST /wschat-bridge/workspaces/:workspaceId/enforce` → `200`

Body: `{ "adminRoleLabel"?: string, "locale"?: "en" | "ru", "assistantsEnabled"?: boolean, "actions"?: { "url": string, "token": string } }`
(`actions`: see "Sample action workflows"; also accepted by `POST …/workspaces`).
Brings a workspace to the rules above;
used once for workspaces created before the service user existed and then on
every full sync as drift repair. Every step checks first, so it is safe to
repeat after a failure part-way. It never removes members (WSChat does that
with `DELETE …/members`).

0. External assistants switched to `assistantsEnabled` (absent: left as they
   are); while off, their grants are revoked (see "External assistants").
   First, so a later failing step never leaves them open.
1. Service user becomes a member with the standard Admin role (repairing a
   half-made membership).
2. Company-admin role created or its label, switches and flags re-applied.
3. Every human on the standard Admin role moves to the company-admin role (after
   step 1, so the last-admin rule is not hit). Humans on any other role than
   company admin or Member are left alone and counted.
4. Owned settings re-applied where they drifted.
5. API role ensured; every active key that does not hold it is revoked (keys
   are issued only through the bridge, so such a key is drift).
6. Pending invitations and approved access domains deleted.
7. Last, after every lockdown step: the WSChat data model is completed. When
   it fails, the earlier steps stay applied and the call answers
   `500 DATA_MODEL_FAILED` (or `409 SCHEMA_BUSY`); repeating it finishes the
   model. Without `locale` existing labels are left as they are.
8. Then the starter layout ("Starter layout"; names and labels in `locale`,
   English without it). Its failures are listed in `starterLayoutFailed` and
   never fail the call.

**Caller's duty:** before writing records or dictionaries into a workspace,
repeat `enforce` (with a pause of a few seconds, also after `409 SCHEMA_BUSY`)
until it answers `"dataModelReady": true`.

Webhooks and iframe media grants are counted, never changed.

Response:

```json
{
  "assistantsEnabled": false,
  "assistantAuthorizationsRevoked": 0,
  "serviceUserAdded": true,
  "adminRoleCreated": true,
  "adminRoleFlagsFixed": false,
  "convertedAdmins": 1,
  "unexpectedRoles": 0,
  "settingsFixed": ["isPasswordAuthEnabled", "editableProfileFields"],
  "invitationsDeleted": 0,
  "approvedDomainsDeleted": 0,
  "iframeMediaPermissions": 0,
  "foreignApiKeysRevoked": 0,
  "activeApiKeys": 0,
  "serviceKeyActive": true,
  "webhooks": 0,
  "sso": "not checked",
  "dataModelCreated": ["wschatCall", "person.wschatPhones"],
  "dataModelRepaired": [],
  "dataModelConflicts": [],
  "dataModelReady": true,
  "starterLayoutCreated": ["task.byType", "wschatConversation.open", "wschatConversation.byOutcome", "wschatCall.missed"],
  "starterLayoutRelabelled": ["task.status", "opportunity.stage"],
  "starterLayoutChanged": ["person.index", "company.index", "workflow.quickLead", "workflow.createCompanyFromPerson", "wschatConversation.main", "wschatCall.main"],
  "starterLayoutSkipped": [],
  "starterLayoutFailed": [],
  "starterLayoutVersion": 6
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
| 409 | `API_KEY_LIMIT_REACHED` | 20 unexpired API-role keys already exist |
| 409 | `SERVICE_KEY` | The key is WSChat's own; rotate it through `service-key` |
| 409 | `RESERVED_KEY_NAME` | A company key named `WSChat` |
| 409 | `SERVICE_USER` | The e-mail is the service user's (create, member upsert/removal, login link) |
| 409 | `LAST_SERVER_ADMIN` | Removing the instance's last server admin from their last workspace |
| 409 | `SEAT_LIMIT_REACHED` | Billing seat limit (billing on only) |
| 409 | `ROLE_NOT_FOUND` | The standard Admin/Member role is missing |
| 409 | `ROLE_NOT_ASSIGNABLE` | Role cannot be assigned to users / not entitled |
| 409 | `MEMBER_ROLE_MISSING` | Member has no role, so the last-admin check cannot run |
| 400 | `DICTIONARY_INVALID` | Bad key, label, duplicate key or too many items in a dictionary |
| 409 | `DATA_MODEL_MISSING` | Dictionary field not created yet; run `enforce` |
| 409 | `SCHEMA_BUSY` | The workspace still runs deferred schema operations (index builds) after the bridge waited up to 90 s; repeat later |
| 500 | `WORKSPACE_CREATION_FAILED` | Creation failed and was rolled back, or clean-up failed (message names the id) |
| 500 | `DATA_MODEL_FAILED` | `enforce`: lockdown applied, data model not finished; repeat |
| 409 | `CONFIRMATION_MISMATCH` | `DELETE …/workspaces/:id`: `confirmSubdomain` is not the workspace's subdomain |
| 409 | `SYSTEM_WORKSPACE` | `DELETE …/workspaces/:id` of the `SERVER_ADMIN_WORKSPACE_ID` workspace |
| 409 | `WORKSPACE_BUSY` | `DELETE …/workspaces/:id` while an application uninstall runs; repeat later |
| 500 | `INTERNAL_ERROR` | Anything else; details only in the server log |

Each mutating call logs one line: workspace id, action, masked e-mail.

`503 SERVICE_USER_NOT_CONFIGURED`: `WSCHAT_BRIDGE_SERVICE_USER_EMAIL` is empty
(all workspace endpoints, not the login link).

## External assistants

ChatGPT, Claude and other MCP clients connect through upstream's MCP endpoint
and OAuth server. Here they are allowed per workspace, off by default; WSChat
turns them on only for companies with its API service, through `enforce`.

Storage: one `core.keyValuePair` row (type `CONFIG_VARIABLE`, the workspace's
id, no user, no application, key `WSCHAT_ASSISTANTS_ENABLED`, value `true`);
no row means off. An existing core table, so no migration; upstream reads
`CONFIG_VARIABLE` rows only with an empty `workspaceId`, and the row goes with
the workspace (cascade). It is read on every gated request, never cached.

Gate (`WschatBridgeAssistantsGateMiddleware`, bound by this module to `/mcp`,
`/mcp/*`, `/oauth/*`, `/.well-known/*`; every refusal is Nest's unknown-route
`404`):

1. The workspace is the one of the request host (`имя.<base>` or a custom
   domain, as upstream resolves it). The service host (`DEFAULT_SUBDOMAIN`,
   e.g. `crm.<base>`), the API host and unknown hosts have none: always closed.
2. That workspace must have assistants on.
3. Every credential sent must belong to that same workspace: the bearer on
   `/mcp` (its JWT `workspaceId`; an unreadable bearer or a session cookie
   without bearer is refused), and on any `/oauth/*` path the `refresh_token`
   / `token` JWTs and the authorization `code` (looked up as upstream stores
   it, SHA-256 in `core.appToken`). Payloads are decoded without verification:
   the gate only refuses, upstream verifies what passes.
4. `grant_type=client_credentials` is refused on every host (confidential apps
   installed in one workspace; no assistant uses it).

`POST /mcp` with no credentials at all passes on an allowed host, so upstream
answers `401` with the `WWW-Authenticate` discovery header. OAuth paths are
matched case-insensitively and credentials are read from the body on any
`/oauth/*` path, as Express routes `/OAuth/Token/` to the token endpoint too.
`/.well-known/api-catalog` is closed with the rest (it points to the OAuth
metadata).

Consent: `WschatBridgeAuthorizeAppGuard`, a global guard, refuses the
`authorizeApp` mutation (`NotFoundException`) unless the session's workspace,
the one the code would be bound to, has assistants on.

Switching off: the gate closes at once; `apply` (and every later `enforce`
while off) also revokes every active authorization of OAuth-only applications
in the workspace (dynamically registered MCP clients and the Twenty CLI) with
upstream's `revokeAuthorizationByIdForWorkspace`, which drops the cached row.
Their access tokens are checked against it on every request, so they stop
working on REST and GraphQL as well, not only on `/mcp`; refresh fails too.
Switching on again does not restore them: the person connects again. Grants of
other applications are not touched; access tokens without a user
(client-credentials) carry no grant and live until they expire
(`APPLICATION_ACCESS_TOKEN_EXPIRES_IN`, 30 minutes by default).

The gate does not depend on `WSCHAT_BRIDGE_SECRET`: with the bridge off,
assistants are closed everywhere. API keys still work on REST/GraphQL; on
`/mcp` they follow the same rule.

Front: the AI settings show the MCP tab and the MCP card of the overview only
when `GET /.well-known/oauth-protected-resource/mcp` on the same host answers
(`modules/wschat/hooks/useWschatAssistantsAllowed.ts`).

## WSChat data model

Created at workspace creation and completed by `enforce`, all owned by the
workspace custom application, all fields read-only in the UI except
`task.wschatShow`, which people tick in the CRM (`isUIEditable: false`; the
records API does not check that flag, so WSChat's key writes them). A new
caller field shows in record pages by itself: the standard FIELDS widgets
declare `newFieldDefaultVisibility: true` (`fieldRecordPageViewFieldOnCreate`).

Polling tasks put on a client later: adding or removing a task target does not
touch the task's `updatedAt` (no hook does; only deleting a task soft-deletes
its targets, `task-post-query-hook.service.ts`). Poll `taskTargets` instead:
`filter=or(createdAt[gte]:"…",updatedAt[gte]:"…",deletedAt[gte]:"…")` (trashed
rows come back only when the filter names `deletedAt`); each row carries
`taskId` and `targetPersonId` (or `targetCompanyId` / `targetOpportunityId`).
The app removes a target with a soft delete (`useUpdateJunctionRelationFromCell`). Each `*Id` field is unique and is the upsert match key of
its object. Definitions, universal identifiers and both label sets (`en`,
`ru`) are in `constants/wschat-bridge-data-model.constant.ts`.

Closed lists are SELECT fields with fixed option values (labels follow
`locale`), so workflow filters can only match real values; the records API
rejects any other value. Channel values (`ch`): `WHATSAPP`, `WHATSAPP_BUSINESS`,
`TELEGRAM`, `INSTAGRAM`, `WIDGET` (Website / Сайт), `PHONE`, `OTHER`.

| Object | Field | Type | Values |
| --- | --- | --- | --- |
| person | `wschatContactId` (unique), `wschatMessengers` (all messengers in one readable line), `wschatPhones` (phones exactly as WSChat has them), `wschatTelegram` (@username), `wschatTelegramId`, `wschatInstagram`, `wschatWhatsappId` (WhatsApp's identifier when the number is hidden) | TEXT | |
| person | `wschatSource`, `wschatLastChannel` | SELECT | ch |
| person | `wschatUrl` | LINKS | |
| person | `wschatLastContactAt` | DATE_TIME | |
| person | `wschatImported` | BOOLEAN, default `false`, not null | |
| opportunity | `wschatLeadId` (unique) | TEXT | |
| opportunity | `wschatSource` | SELECT | ch |
| opportunity | `wschatUrl` | LINKS | |
| task | `wschatTaskId` (unique) | TEXT | |
| task | `wschatType` | SELECT, per company | dictionary `taskTypes` |
| task | `wschatAuthor` | SELECT | `EMPLOYEE`, `ROBOT`, `OTHER` |
| task | `wschatUrl` | LINKS | |
| task | `wschatImported` | BOOLEAN, default `false`, not null | |
| task | `wschatShow` ("Show in WSChat" / «Показать в WSChat») | BOOLEAN, default `false`, not null, **editable in the UI** | |
| company | `wschatContactId` (unique), `wschatPhones` | TEXT | |
| company | `wschatUrl` | LINKS | |
| company | `wschatImported` | BOOLEAN, default `false`, not null | |
| wschatConversation | `wschatConversationId` (unique), `outcomeNote` | TEXT | |
| wschatConversation | `channel` | SELECT | ch |
| wschatConversation | `state` | SELECT | `OPEN`, `CLOSED` |
| wschatConversation | `outcome` | SELECT, per company | dictionary `outcomes` |
| wschatConversation | `outcomeTone` | SELECT | `SUCCESS`, `REFUSAL`, `POSTPONED`, `JUNK` |
| wschatConversation | `closedBy` | SELECT | `EMPLOYEE`, `ROBOT`, `CLIENT`, `AUTO` |
| wschatConversation | `lastMessageFrom` | SELECT | `CLIENT`, `EMPLOYEE`, `ROBOT` |
| wschatConversation | `startedAt`, `closedAt`, `lastMessageAt` | DATE_TIME | |
| wschatConversation | `isNewClient` | BOOLEAN | |
| wschatConversation | `wschatUrl` | LINKS | |
| wschatConversation | `wschatImported` | BOOLEAN, default `false`, not null | |
| wschatConversation | `person` → person, `responsible` → workspaceMember | RELATION (many-to-one) | |
| wschatCall | `wschatCallId` (unique), `outcomeNote`, `summary` | TEXT | |
| wschatCall | `direction` | SELECT | `INBOUND`, `OUTBOUND` |
| wschatCall | `status` | SELECT | `COMPLETED` (Answered), `MISSED`, `DECLINED`, `FAILED` |
| wschatCall | `channel` | SELECT | `PHONE`, `WHATSAPP_BUSINESS`, `WHATSAPP`, `TELEGRAM`, `OTHER` |
| wschatCall | `outcome` | SELECT, per company | dictionary `outcomes` |
| wschatCall | `startedAt` | DATE_TIME | |
| wschatCall | `durationSeconds` | NUMBER | |
| wschatCall | `wschatUrl` | LINKS | |
| wschatCall | `wschatImported` | BOOLEAN, default `false`, not null | |
| wschatCall | `person` → person, `answeredBy` → workspaceMember, `conversation` → wschatConversation | RELATION (many-to-one) | |

A SELECT cannot be created without options (`validate-field-metadata-input-options.util.ts`),
so the per-company fields start with one placeholder option `NOT_SET`
(Not set / Не задано). It is kept forever and never written by WSChat;
removing it would only blank records holding it (none). Fixed option lists are
set at creation; enforce does not rewrite them (a type mismatch is reported
in `dataModelConflicts`, never altered).

Both custom objects also have Twenty's standard `name` (WSChat writes a short
title there). Relations add a list on the target object whose name Twenty
computes from its English label, so it is the same in every workspace:
`wsChatConversations` and `wsChatCalls` on person,
`wsChatConversationsResponsible` and `wsChatCallsAnswered` on workspaceMember,
`wsChatCalls` on wschatConversation. Their labels follow `locale`.

**Busy schema.** A schema-changing migration is refused while the workspace
still has deferred schema operations (`build_index`, `validate_foreignKey`,
`rebuild_object`) PENDING or IN_PROGRESS
(`workspace-migration-runner.service.ts`, `in-flight-deferred-workspace-operations.service.ts`).
By default upstream defers index builds to a background job, so one migration
blocked the next. The bridge runs its migrations with
`shouldDeferActions: false`, as upstream upgrade commands do: indexes are built
inside the call and leave nothing pending. Where a call has no such switch
(`updateManyObjects`) or another change is still running, the bridge retries
with growing pauses (1 s doubling to 10 s, at most 90 s in total) and then
answers `409 SCHEMA_BUSY`. The same applies to the dictionaries endpoint.

Ensure, step by step (each step re-reads metadata, so a run that stopped
part-way is finished by the next one):

1. Each missing custom object: `ObjectMetadataService.createOneObject` (one
   workspace migration each; it also creates the default view and a left
   navigation item).
2. Object labels / reactivation: one `updateManyObjects` call.
3. All missing fields of all objects: ONE `FieldMetadataService.createManyFields`
   call (one migration, relations included).
4. Labels and reactivation of existing fields and of the relation lists: one
   `updateOneField` per changed field.

A fresh workspace therefore costs 3 migrations in English and 8 in Russian (the
5 relation lists are created with English labels, to keep their names stable,
then relabelled). An object or field with our name that is not ours (another
universal identifier) or has another type/uniqueness is never touched and is
reported in `dataModelConflicts`; fields of a missing or foreign object are
reported there too. A company admin with the data-model permission can
deactivate or delete our fields and objects: a deactivated one is
reactivated with its data; a deleted one is recreated empty, and WSChat must
send its records again.

Records access: the API role, Member and company admin have record access to
all objects (role-level switches), which covers custom objects too.

### `PUT /wschat-bridge/workspaces/:workspaceId/dictionaries` → `200`

```json
{
  "outcomes": [{ "key": "SOLD", "label": "Продано", "color": "green" }, { "key": "OLD_REASON", "label": "Старое", "archived": true }],
  "taskTypes": [{ "key": "CALL_BACK", "label": "Перезвонить" }],
  "locale": "ru"
}
```

Each list is optional and independent; WSChat sends the full current list.
`outcomes` is applied to both `wschatConversation.outcome` and
`wschatCall.outcome`, `taskTypes` to `task.wschatType`.

- `key` = option value: UPPER_SNAKE_CASE (`^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`, no
  double underscore), at most 63 characters, not `NOT_SET`, unique in the list.
- `label`: 1..52 characters, no comma (Twenty's option label limit is 63 and the
  archive suffix must fit). `color`: one of Twenty's tag colours (`red`, `ruby`,
  `crimson`, `tomato`, `orange`, `amber`, `yellow`, `lime`, `grass`, `green`,
  `jade`, `mint`, `turquoise`, `cyan`, `sky`, `blue`, `iris`, `violet`,
  `purple`, `plum`, `pink`, `bronze`, `gold`, `brown`, `gray`); default: the
  current one, else `gray`. At most 200 items.
- Missing options are added; a different label or colour is updated;
  `archived: true` keeps the option (records keep it) and suffixes its label
  with « (archived)» / « (архив)» (`locale`, default `en`; never twice) and
  moves it after the live ones. Options absent from the request are kept as
  they are and counted in `orphanOptions`; options are never deleted
  (deleting one blanks it on every record:
  `workspace-schema-enum-manager.service.ts`). Order = request order, archived
  after, orphans after, `NOT_SET` last.
- One `updateOneField` (one workspace migration) per field whose options
  really changed: a changed outcomes list costs 2, task types 1, an unchanged
  request 0. Changing the set of values rewrites the enum column of that
  object's table.

Response: `{ "outcomes": { "added", "relabelled", "archived", "orphanOptions", "total" }, "taskTypes": { ... } }`
(outcomes counted on the conversation field). Errors: `400 DICTIONARY_INVALID`
(message names the list and the problem), `409 DATA_MODEL_MISSING` (the field
does not exist yet: run `enforce`), `409 SCHEMA_BUSY` (repeat later).

## Starter layout

What a new workspace looks like on day one, so it resembles the CRM working
with WSChat; companies change it as they like
(`services/wschat-bridge-starter-layout.service.ts`, definitions in
`constants/wschat-bridge-starter-layout.constant.ts`).

**Labels of shipped option lists.** Upstream does not translate option labels
(`fieldMetadataOption` is not in `TRANSLATABLE_PROPERTIES_BY_METADATA_NAME`),
so a Russian workspace showed `To do` / `In progress` / `Done`.

| Field | Values → `ru` labels |
| --- | --- |
| `task.status` | `TODO` Открыта, `IN_PROGRESS` В работе, `DONE` Выполнена |
| `opportunity.stage` | `NEW` Новая, `SCREENING` Квалификация, `MEETING` Встреча, `PROPOSAL` Предложение, `CUSTOMER` Клиент |

- Only an option whose label still equals the shipped English one is
  relabelled; a label the company changed is never overwritten. Values never
  change (WSChat writes `TODO`/`DONE`), and a label-only change leaves the
  enum column alone (`field-metadata-option-enum-schema.service.ts`).
- Written with `updateOneField` as the workspace's custom application, which
  makes it a workspace *override* of the standard option
  (`compute-field-metadata-option-operations-for-field.util.ts`); the base
  label stays as shipped. `synchronizeTwentyStandardApplicationOrThrow` runs at
  workspace creation, not on upgrades; should a future upgrade command still
  reset the labels to English, the rule "relabel while it reads as shipped"
  runs on every `enforce` and puts them back, with no extra cost otherwise.

**Starter views** (version 1), once per layout version (positions in the table below as created since 27.11):

| Object | View | Shape |
| --- | --- | --- |
| task | By type / По типу | board grouped by `wschatType`, listed first (position −1); upstream's "By status" and the others stay |
| wschatConversation | Open / Открытые | `state` is `OPEN`, newest `lastMessageAt` first |
| wschatConversation | By outcome / По итогам | board grouped by `outcome` |
| wschatCall | Missed / Пропущенные | `status` is `MISSED`, newest `startedAt` first |

- Built with upstream's own view utils (`fromCreateViewInputToFlatViewToCreate`,
  `buildCompleteViewChildrenFlatOperations`) and run as one workspace migration
  per view through `WorkspaceMigrationValidateBuildAndRunService`, like the AI
  tool's `CompleteViewUpsertService` (which takes no position and no universal
  identifier). Each view has a fixed universal identifier and is owned by the
  workspace custom application. Records are not touched.
- Board columns: upstream creates one per active option when the view is
  created and, when options change later, one per new option
  (`recompute-view-groups-on-flat-field-metadata-options-update.util.ts`). It
  appends them after every existing column, the placeholder and "no value"
  included, so after each `PUT …/dictionaries` that really changed a field the
  bridge reorders only OUR boards still grouped by that field: known columns
  keep the company's order, new ones follow in dictionary order, then the
  placeholder `NOT_SET` (always hidden: nobody holds it) and "no value" last.
  Archived dictionary entries keep their column (they are still options).
- Once: the applied version is a `core.keyValuePair` row of the workspace
  (`CONFIG_VARIABLE`, key `WSCHAT_STARTER_LAYOUT_VERSION`). Versions are
  walked in order and each one is recorded as soon as it is complete, so a
  view the company deleted or changed is never brought back. A version that
  is not complete (a failure, or version 4 waiting for `actions`) stops the
  walk there; the next call resumes at it. Until 27.11 the version was written
  only after the last one, so a workspace created without `actions` stayed at
  0 and every `enforce` walked version 1 again. A run that failed part-way
  creates the missing views next time and skips those already there (by
  universal identifier).
- To ship more later: raise `WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION` and tag the
  new views with it.

**Main views** (`services/wschat-bridge-starter-index-views.service.ts`), edited
with upstream's view and view-field utils in one workspace migration; columns
are only added, moved or hidden, never deleted.

A custom object has two "All …" tables: the INDEX view (`key = INDEX`,
position 0, engine-made, named by the template `All {objectLabelPlural}`) and
the initial view `createOneObject` adds for an object of the workspace's own
application (`computeInitialObjectViewToCreate`: `All <label plural>` as it
was at creation, position 1, not engine-made, universal identifier from
`getInitialObjectViewUniversalIdentifier`). The app opens the first non-INDEX
view by position (`computeObjectViewTargetIds`), so people see the initial
view. Standard objects have only the INDEX table.

| Version | Object | View | Change |
| --- | --- | --- | --- |
| 2 | person | INDEX | wschatLastContactAt, wschatLastChannel, wschatUrl appended, unless already on the view (shown or hidden) |
| 2 | company | INDEX | wschatPhones, wschatUrl appended, same rule |
| 5 | wschatConversation | initial | renamed All conversations / Все обращения, moved to position 0; columns name, person, channel, state, outcome, responsible, lastMessageAt, lastMessageFrom, startedAt, wschatUrl, the others hidden after them |
| 6 | task | INDEX, and our "By type" board | `wschatShow` appended, same rule as version 2 |
| 5 | wschatCall | initial | renamed All calls / Все звонки, position 0; columns name, person, direction, status, channel, startedAt, durationSeconds, answeredBy, outcome, summary, wschatUrl |

- Version 2 used to rename and reshape the INDEX views of conversations and
  calls (through overrides, as INDEX is engine-made). Version 5 puts them back
  first (`services/wschat-bridge-index-view-revert.service.ts`): while the
  effective name is one of ours and exactly our columns are shown, each
  overridden engine column is rewritten to its base position and visibility
  (an update equal to the value beneath drops the override), the name too,
  and columns version 2 added are removed; anything else is the company's and
  goes to `starterLayoutSkipped` (`wschatConversation.index`,
  `wschatCall.index`). The view picker lists the INDEX view only while it is
  the open view (`computeViewPickerVisibleViews`), whatever its overrides.
- Version 5 changes the initial view only while untouched: named
  `All <label plural>` in one of our labels or the current one, and every
  column shown and among upstream's first columns (`name`, `createdAt`,
  `createdBy`, `updatedAt`, `updatedBy`). The view belongs to the workspace's
  own application, so a company's edits change it directly: a rename, a
  hidden or an added column is seen, a moved or deleted one is not. A touched
  view goes to `starterLayoutSkipped`; one already carrying our name is left
  as it is.
- Starter views of version 1 sit at positions 2–3 on these objects (since
  27.11; earlier workspaces have them at 1–2), so they never tie with the
  initial view.
- Report: `starterLayoutChanged` (main views written), `starterLayoutSkipped`.

**Sample workflows** (version 3, `services/wschat-bridge-sample-workflows.service.ts`):
upstream's `prefillWorkflows` creates "Quick Lead" (manual) and "Create company
when adding a new person" (on `person.upserted` of `emails`, people from e-mail
and calendar sync excluded), both ACTIVE. The second one fired on every person
WSChat wrote and failed at its first CODE step, as code execution is disabled
here. Both are switched off with the Deactivate button's service, which also
drops them from the automated trigger map (built from ACTIVE versions only,
`workspace-workflow-automated-trigger-map-cache.service.ts`), so records
written afterwards start no run. Only a workflow still in its shipped state
is touched: exactly one version, upstream's id (derived from the workspace id,
`getWorkflowPrefillIds`), and ACTIVE; editing an active version always makes a
new one, so an edited workflow is reported in `starterLayoutSkipped`. Switched
off ones go to `starterLayoutChanged` (`workflow.quickLead`,
`workflow.createCompanyFromPerson`). Past runs are kept. A company can switch
them on again or build its own as usual.

## Sample action workflows

Starter layout version 4 (`services/wschat-bridge-sample-action-workflows.service.ts`,
manifests in `utils/build-sample-action-workflows.util.ts`): three workflows
that act in WSChat through an HTTP request step, created as DRAFTS (no trigger
is subscribed until the company activates one), named in `locale`:

| Sample | Trigger | Steps |
| --- | --- | --- |
| Missed call → "Call back" task in WSChat | `wschatCall` created, `status` MISSED, `wschatImported` false, has a person | find the person, `POST {url}/tasks` `{contact, title, key}` |
| Conversation closed successfully → message to the client | `wschatConversation` updated, watching `state` and `outcomeTone` only; `state` CLOSED, `outcomeTone` SUCCESS, `wschatImported` false, has a person | find the person, `POST {url}/messages` `{contact, text, channel: "last", key}` |
| Scheduled reminder to clients | cron `0 4 1 * *`: the 1st of each month at 04:00 in the SERVER's time zone (cron-parser without `tz`; 10:00 in Bishkek when the server runs on UTC) | find people (a placeholder condition that matches nobody, named "SET UP…", with the daily channel limits mentioned), loop, `POST {url}/messages` per person |

- `actions` (`{url, token}`) comes with `enforce` or creation; every HTTP step
  gets `Authorization: Bearer <token>`. Without `actions` the samples are not
  created and the layout stays at version 3, so the next call that brings it
  creates them. The token is never stored elsewhere or logged by the bridge.
- `key` (WSChat ignores a key it saw in the last day): the triggering record's
  `id:updatedAt`, so a retried step does nothing twice and a new change of the
  same record acts again; the reminder uses the person's `id:updatedAt`. No
  run id is exposed to step variables. The missed-call task has no due date:
  step variables have no date arithmetic. No task type is set (`T_<id>` is
  per company).
- The missed-call sample listens to `created` only: an upsert that inserts
  carries no updated fields, and an updated trigger would fire on re-syncs.
- WSChat's own later updates of a closed conversation (last message, its
  reply to the sample's message) change neither `state` nor `outcomeTone`,
  so they start nothing; the samples only make HTTP calls and never update
  the record that started them; `wschatImported` excludes the history load.
- Once: after version 4 they are ordinary workflows of the workspace; the
  company edits, activates or deletes them and no call recreates or rewrites
  them. A changed token is NOT written into them: replacing it in the steps
  is a manual edit (rare). A run that stopped part-way skips samples already
  there by name.
- Who sees the token: reading workflows, their versions and runs needs the
  `WORKFLOWS` settings flag (resolvers' `AccessPolicyGuard`; the records API
  grants the workflow objects only with that flag,
  `compute-role-records-permissions.util.ts`; the AI chat's workflow tools
  likewise, `workflow-tool.provider.ts`). Members and API-role keys (records
  API, MCP) have no settings flags, so only the company admin role and the
  service user see it. A run's step log redacts `Authorization`
  (`build-http-request-step-log.util.ts`); the run's `state` keeps the step
  definition and is behind the same flag; runs are system objects with no
  timeline.

## Workflows

Everything WSChat does lands in records, so companies build their own Twenty
workflows on them ("Record is created / updated" triggers on custom objects
work, also for writes made with an API key; a trigger can watch chosen fields
and carry a filter). Useful events:

- conversation created (a new dialog; `channel`, `isNewClient`);
- conversation updated, watching `lastMessageAt` (a new message; `lastMessageFrom`);
- conversation updated, watching `state`, filter `state = CLOSED` with
  `outcome` / `outcomeTone` / `closedBy`;
- call created, filter on `status` / `direction` / `channel`;
- task created, filter on `wschatAuthor` / `wschatType`; task updated watching `status`;
- person created.

**History load.** Add the condition `wschatImported = false` to every trigger
that must not react to history. WSChat sets `wschatImported = true` only on
records it loads in bulk during the first load of existing data and never
changes it afterwards. So later live updates of an imported record still carry
`true`: a workflow that should react to live changes of old records must filter
on the changed field (e.g. `state`), not on this flag. The field is NOT NULL
with default `false`, so other records read `false` (existing rows are filled
when the field is added).

How events are emitted (`twenty-orm/repository/workspace-repository.ts`,
`twenty-orm/utils/format-twenty-orm-event-to-database-batch-event.util.ts`):
an upsert that inserts emits `created` + `upserted`; one that updates emits
`updated` + `upserted`; an update that changes nothing emits no `updated` but
still emits `upserted`, so build on "created" / "updated", not on "created or
updated" (upserted), which fires on every repeated sync.

Workflows run with their application's role; records they create are stamped
`createdBy.source = WORKFLOW` (`record-crud/services/create-record.service.ts`).

Hazards: there is no silent mode, so without the `wschatImported` filter a bulk
load fires one run per matching record; and a workflow that updates a field its
own trigger watches re-triggers itself.

## Records API used by WSChat

WSChat reads and writes with its service key (`Authorization: Bearer <token>`).

- Upsert: `POST /rest/batch/people?upsert=true` (likewise
  `/rest/batch/opportunities`, `/rest/batch/tasks`, `/rest/batch/companies`,
  `/rest/batch/wschatConversations`, `/rest/batch/wschatCalls`). At most 200
  records per call (`QUERY_MAX_RECORDS`,
  `common-create-many-query-runner.service.ts`). A record matches an existing
  one by `id` or by any unique field, so by `wschatContactId` /
  `wschatLeadId` / `wschatTaskId` / `wschatConversationId` / `wschatCallId`
  (`get-conflicting-fields.util.ts`). REST paths use the object's plural name
  (`rest-api-base.handler.ts`, `idByNamePlural`).
- Upsert and the trash: matching also looks at soft-deleted records
  (`common-create-many-query-runner.service.ts`, `.withDeleted()`), because our
  unique indexes do not exclude deleted rows (`indexWhereClause: null`,
  `generate-index-for-flat-field-metadata.util.ts`; only a single-field index
  with `"deletedAt" IS NULL` would make matching skip them,
  `get-conflicting-fields.util.ts`). A matched record is updated with
  `deletedAt: null`: re-sending a record that someone put in the trash
  brings it back. WSChat must check `deletedAt` first if a deletion in the CRM
  should stick.
- Deleting (any object): `DELETE /rest/<plural>/<id>?soft_delete=true` moves
  the record to the trash; `DELETE /rest/<plural>?soft_delete=true&filter=…`
  does the same for many. Without `soft_delete=true` the request is a
  DESTROY (permanent), which the API role is refused with
  `403 PERMISSION_DENIED` (`rest-api-core.service.ts`, `delete`;
  `parse-soft-delete-rest-request.util.ts`: only the exact value `true`
  counts).
- Restore from the trash: `PATCH /rest/<plural>/<id>/restore`, or
  `PATCH /rest/<plural>/restore?filter=…` for many
  (`parse-core-path.utils.ts`, `rest-api-core.service.ts`, `restore`).
- Merge duplicates: `PATCH /rest/<plural>/merge` with body
  `{ "ids": ["<id>", ...], "conflictPriorityIndex": 0, "dryRun": false }`;
  the record at `conflictPriorityIndex` wins field conflicts, the others are
  merged into it and deleted (`rest-api-merge-many.handler.ts`,
  `common-merge-many-query-runner.service.ts`).
- Changes made in the CRM: `GET /rest/people?filter=updatedAt[gte]:"<ISO date>"&order_by=updatedAt[AscNullsFirst]`
  (filter syntax `field[op]:value`, conjunctions `and(...)`, `or(...)`,
  `not(...)`: `filter-parser-utils/`; order syntax `field[AscNullsFirst|AscNullsLast|DescNullsFirst|DescNullsLast]`:
  `parse-order-by-rest-request-common.util.ts`). Trashed records are
  returned only when the filter mentions `deletedAt`, e.g.
  `filter=deletedAt[gte]:"<ISO date>"` or `deletedAt[is]:NOT_NULL`
  (`common-query.parser.ts`, `applyDeletedAtToBuilder`; `is` takes `NULL` or
  `NOT_NULL`).
- Author stamp: records written by the key get
  `createdBy`/`updatedBy = { source: "API", name: "WSChat", workspaceMemberId: null }`
  (`build-created-by-from-api-key.util.ts`).
- Relations are written as `<field>Id`: a conversation's `personId`,
  `responsibleId` (a workspaceMember id), a call's `personId`, `answeredById`,
  `conversationId`.
- A task is linked to a person through a `taskTarget` record:
  `POST /rest/taskTargets` with `{ "taskId", "targetPersonId" }`
  (also `targetCompanyId`, `targetOpportunityId`). Standard task fields:
  `title` (TEXT), `bodyV2` (RICH_TEXT: `{ "markdown": "..." }`), `dueAt`
  (DATE_TIME), `status` (SELECT `TODO` / `IN_PROGRESS` / `DONE`),
  `assigneeId` (workspaceMember).
- Standard opportunity fields: `name` (TEXT), `amount` (CURRENCY
  `{ "amountMicros", "currencyCode" }`), `closeDate` (DATE_TIME), `stage`
  (SELECT `NEW` / `SCREENING` / `MEETING` / `PROPOSAL` / `CUSTOMER`, default
  `NEW`), `pointOfContactId` (person), `companyId` (company), `ownerId`
  (workspaceMember).
- Rate limits: `API_RATE_LIMITING_SHORT_TTL_IN_MS` / `_SHORT_LIMIT` (default
  100 per second) and `API_RATE_LIMITING_LONG_TTL_IN_MS` / `_LONG_LIMIT`
  (default 100 per minute).

## Server settings this design relies on

- `AUTH_PASSWORD_ENABLED=false`: a workspace admin cannot switch password
  sign-in back on (`updateWorkspaceById` refuses it). Bridge login links are
  not affected; the token exchange does not read it.
- `IS_EMAIL_VERIFICATION_REQUIRED=false`: closes the invitation +
  verify-e-mail join path (`verifyEmailAndGetLoginToken`).
- `AUTH_GOOGLE_ENABLED` / `AUTH_MICROSOFT_ENABLED` off.
- No enterprise key (SSO and other enterprise features stay off).
- `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS` empty and never
  `OUTBOUND_HTTP_SAFE_MODE_ENABLED=false`: webhooks, the HTTP tool and IMAP
  hosts go through the SSRF-safe client.
- `NODE_ENV=production`, so `LOGIC_FUNCTION_TYPE` and `CODE_INTERPRETER_TYPE`
  default to disabled.
- The `logger` e-mail driver writes full e-mail bodies (login and verification
  links included) to the server log; use a real driver or treat the log as
  secret.

## AI through WSChat

AI inside each CRM workspace is served by WSChat through an OpenAI-compatible
endpoint. Two small upstream edits (listed in `WSCHAT.md`) make that endpoint
able to meter and bill per company:

- Every model call carries attribution headers, built next to the telemetry
  options in `build-ai-telemetry.util.ts`; other providers simply ignore them:
  - `X-WSChat-Feature`: always; which Twenty feature calls.
  - `X-WSChat-Workspace-Id`: the company's workspace, when known.
  - `X-WSChat-User-Workspace-Id`: the member's membership, when known.
  - `X-WSChat-Agent-Id`: the AI agent, when an agent runs.
- Feature values: `ai-chat-stream`, `ai-chat-workspace-setup-stream`,
  `agent-execution`, `agent-structured-output`, `agent-title-generation`,
  `repair-tool-call`, `ai-generate-text`.
- openai-compatible providers are built with `includeUsage: true`, so streamed
  answers end with a usage chunk.

Server settings:

- `AI_CATALOG_STORAGE_PATH`, e.g. `config/ai-catalog.json`: a catalogue file in
  the configured storage. With `STORAGE_TYPE=local` it is read from
  `<STORAGE_LOCAL_PATH>/<path>`; in the image the default local path is
  `/app/packages/twenty-server/.local-storage`, so with our compose mount the
  file lives at `/srv/data/twenty/storage/config/ai-catalog.json` on the host.
  It is read once, when each server or worker process starts
  (`DefaultAiCatalogService.onModuleInit`), so changes need a restart. It
  replaces the built-in provider list, and a file that cannot be read leaves
  NO providers at all (no fallback to the built-in list). Providers from this
  catalogue are not "custom providers": the 25-seat rule without an enterprise
  key (`CustomAiProviderAccessService`, `MAX_SEATS_WITHOUT_ENTERPRISE_KEY`)
  only drops entries coming from `AI_PROVIDERS`
  (`ProviderConfigService.getResolvedProviders`, `includeCustomProviders`).
  In `apiKey`, `baseUrl`, `accessKeyId`, `secretAccessKey` a whole value of
  the form `{{NAME}}` is replaced by the config variable `NAME`, or by the
  plain environment variable `NAME` if it is not a declared one. A provider
  without an API key counts as not configured and serves nothing.
- `AI_MODELS_DEFAULT_FAST`, `AI_MODELS_DEFAULT_SMART` (and the other
  `AI_MODELS_DEFAULT_*` tiers): model ids as `provider/model`, e.g.
  `["wschat/wschat-fast"]`.
- `AI_SIGNED_FILE_URLS_ENABLED=false`: files go to the endpoint as bytes, not
  as links to this server.
- Leave `AI_USER_CREDITS_LIMIT` unset: credits are WSChat's balance, checked
  by the endpoint itself.

Minimal catalogue for one provider:

```json
{
  "wschat": {
    "npm": "@ai-sdk/openai-compatible",
    "name": "wschat",
    "label": "WSChat",
    "baseUrl": "{{WSCHAT_AI_BASE_URL}}",
    "apiKey": "{{WSCHAT_AI_API_KEY}}",
    "models": [
      { "name": "wschat-fast", "label": "WSChat Fast" },
      { "name": "wschat-smart", "label": "WSChat Smart" }
    ]
  }
}
```

