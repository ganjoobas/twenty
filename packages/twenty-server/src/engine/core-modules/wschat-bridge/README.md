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
   company-admin role created, the whole WSChat data model created (see "WSChat
   data model", labels in `locale`).
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

Body: `{ "adminRoleLabel"?: string, "locale"?: "en" | "ru" }`. Brings a
workspace to the rules above;
used once for workspaces created before the service user existed and then on
every full sync as drift repair. Every step checks first, so it is safe to
repeat after a failure part-way. It never removes members (WSChat does that
with `DELETE …/members`).

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
   `500 DATA_MODEL_FAILED`; repeating it finishes the model. Without `locale`
   existing labels are left as they are.

Webhooks and iframe media grants are counted, never changed.

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
  "iframeMediaPermissions": 0,
  "foreignApiKeysRevoked": 0,
  "activeApiKeys": 0,
  "serviceKeyActive": true,
  "webhooks": 0,
  "sso": "not checked",
  "dataModelCreated": ["wschatCall", "person.wschatPhones"],
  "dataModelRepaired": [],
  "dataModelConflicts": []
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
| 500 | `WORKSPACE_CREATION_FAILED` | Creation failed and was rolled back, or clean-up failed (message names the id) |
| 500 | `DATA_MODEL_FAILED` | `enforce`: lockdown applied, data model not finished; repeat |
| 500 | `INTERNAL_ERROR` | Anything else; details only in the server log |

Each mutating call logs one line: workspace id, action, masked e-mail.

`503 SERVICE_USER_NOT_CONFIGURED`: `WSCHAT_BRIDGE_SERVICE_USER_EMAIL` is empty
(all workspace endpoints, not the login link).

## WSChat data model

Created at workspace creation and completed by `enforce`, all owned by the
workspace custom application, all fields read-only in the UI
(`isUIEditable: false`; the records API does not check that flag, so WSChat's
key writes them). Each `*Id` field is unique and is the upsert match key of
its object. Definitions, universal identifiers and both label sets (`en`,
`ru`) are in `constants/wschat-bridge-data-model.constant.ts`.

Closed lists are SELECT fields with fixed option values (labels follow
`locale`), so workflow filters can only match real values; the records API
rejects any other value. Channel values (`ch`): `WHATSAPP`, `WHATSAPP_BUSINESS`,
`TELEGRAM`, `INSTAGRAM`, `WIDGET` (Website / Сайт), `PHONE`, `OTHER`.

| Object | Field | Type | Values |
| --- | --- | --- | --- |
| person | `wschatContactId` (unique), `wschatMessengers`, `wschatPhones` | TEXT | |
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
| company | `wschatContactId` (unique) | TEXT | |
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
does not exist yet: run `enforce`).

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
- A soft-deleted record still holds its unique value (the unique index does
  not exclude deleted rows, `generate-index-for-flat-field-metadata.util.ts`):
  restore it with `PATCH /rest/people/<id>/restore` before sending it again.
- Merge duplicates: `PATCH /rest/people/merge`.
- Changes made in the CRM: poll `GET /rest/people` ordered and filtered by
  `updatedAt`; deleted ones by `deletedAt`.
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

