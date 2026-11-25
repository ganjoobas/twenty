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
