# Twenty, WSChat fork

This repository is upstream [Twenty](https://github.com/twentyhq/twenty) at tag
`twenty/v2.62.0`, plus a few additions used by WSChat:

- `packages/twenty-server/src/engine/core-modules/wschat-bridge/`: a small
  server module that issues one-time login links for workspace members to a
  trusted WSChat server (see its `README.md`). It is off unless
  `WSCHAT_BRIDGE_SECRET` is set. Registered in `core-engine.module.ts`; its
  config variable is declared in `twenty-config/config-variables.ts`.
  It also lets WSChat create a workspace for a client company and keep its
  members in sync, with no sign-up, invitations or onboarding screens. For
  that, `auth.module.ts` exports `SignInUpService` (one added line).
  People and sign-in settings of bridge workspaces are owned by WSChat: a
  service user (`WSCHAT_BRIDGE_SERVICE_USER_EMAIL`) holds the Admin role,
  company admins get a restricted role, and `/enforce` repairs drift.
  API keys are issued only through the bridge, with a records-only role.
  The bridge also adds WSChat's fields and objects (conversations, calls) to
  each workspace and issues WSChat its own records-API key.
  Closed lists are SELECT fields for workflow filters; outcome and task-type
  options are kept per company through `PUT …/dictionaries`.
  External assistants (MCP, OAuth, `authorizeApp`) are closed unless WSChat
  allows them for the workspace; the module binds its own middleware and a
  global guard for that, no upstream file is edited (README, "External
  assistants").
  New workspaces get a starter layout once: translated labels of the shipped
  task status and opportunity stage lists (as workspace overrides, only while
  they read as shipped) and four views (tasks by type, open conversations,
  conversations by outcome, missed calls), all through upstream's metadata
  services (README, "Starter layout"). Version 2 renames and sets the columns
  of the main conversation and call views while untouched, and appends WSChat
  columns to the main people and company views.
- `auth/constants/max-workspaces-without-organization-key.constant.ts`: the
  number of workspaces allowed without an enterprise key is raised from 5 to
  10000, because every WSChat client company gets its own workspace.
- `metadata-modules/ai/ai-models/utils/build-ai-telemetry.util.ts`: every AI
  call also sends `X-WSChat-*` headers naming the feature and workspace, so the
  WSChat AI endpoint can meter and bill each company.
- `metadata-modules/ai/ai-models/services/sdk-provider-factory.service.ts`:
  openai-compatible providers ask for token usage on streamed responses.
- `twenty-front`: links in LINKS fields (`LinksFieldDisplay.tsx`) and the
  cell's "open link" button (`useGetSecondaryFieldButton.ts`) are handed to
  the page embedding the CRM instead of opening a new tab, see below
  (`ui/field/display/utils/postLinkToEmbeddingHost.ts`).
- `twenty-front`: features that make no sense inside the WSChat frame are
  hidden, switched in one place, `modules/wschat/constants/WschatHiddenFeatures.ts`:
  - two-factor authentication: the profile section is not shown and
    `/settings/profile/two-factor-authentication/*` goes back to the profile
    (`SettingsProfile.tsx`, `SettingsRoutes.tsx`). People sign in only through
    WSChat, which has its own second factor. The server side is untouched: the
    code step at sign-in still works for anyone who has 2FA on, and the bridge
    resets it;
  - AI usage: the Usage tab of AI settings is filtered out (`SettingsAI.tsx`;
    `#usage` falls back to the first tab) and the per-user usage page goes back
    to AI settings (`SettingsRoutes.tsx`). It is a paid upstream feature; WSChat
    meters AI itself;
  - Logout: the settings menu item (`useSettingsNavigationItems.tsx`) and
    "Log out" in the workspace menu (`MultiWorkspaceDropdownDefaultComponents.tsx`).
    Leaving is done in WSChat; the CRM sign-in screen is not used. Sign-outs
    the app performs itself (after deleting the account, ending impersonation,
    on the sign-in and plan screens) are kept;
  - Create Workspace in the workspace menu: workspaces are created only by
    WSChat through the bridge. With Log out also gone that "⋯" menu would be
    empty, so its button is not shown either
    (`MultiWorkspaceDropdownDefaultComponents.tsx`);
  - Delete account in the profile (`SettingsProfile.tsx`; the server mutation
    is untouched): people are managed by WSChat, self-deletion would drop the
    person from every company's CRM and the next sync would recreate them.
  - Invite user in the workspace menu (`MultiWorkspaceDropdownDefaultComponents.tsx`):
    people are invited only by WSChat; the item only led back to the profile.
  - the workspace switcher in the workspace menu (`MultiWorkspaceDropdownDefaultComponents.tsx`,
    flag `workspaceSwitcher`): the company is picked in WSChat, and switching
    inside its frame would show another company's CRM there;
  - the workspace sign-in screen (`SignInUp.tsx`, flag `signInScreen`): it
    offers no way in here, so a signed-out visitor goes to WSChat instead
    (`modules/wschat/hooks/useWschatEnterThroughHost.ts`). In the WSChat frame
    the frame itself reloads on `<embedding page>/workspace/crm/enter?frame=1`
    (origin as `postLinkToEmbeddingHost` reads it, now exported as
    `getEmbeddingHostOrigin`); a standalone tab goes to
    `https://<FRONTEND_URL host>/workspace/crm/enter`, FRONTEND_URL being
    WSChat's own address in this setup, with `return=<path>` only for an
    assistant's consent page (`/authorize?…`, at most 2048 characters). WSChat
    turns it into the login link's `returnToPath`. Only the plain screen of a
    workspace (step Init, no invitation) is replaced; the 2FA steps after a
    login link, `/verify` and the other pages are not. One trip per tab every
    2 minutes (`sessionStorage`), so a refusal on the WSChat side shows the
    plain screen instead of a loop.
- `twenty-front`: the MCP tab of AI settings and the MCP card of its overview
  are shown only where the server lets assistants in (`SettingsAI.tsx`,
  `modules/wschat/hooks/useWschatAssistantsAllowed.ts`: one request to
  `/.well-known/oauth-protected-resource/mcp`, `404` when not allowed).
- `twenty-front`, Salesfarce theme: upstream keeps it for one reload
  (`sessionStorage`); here the choice is also pinned in `localStorage`
  (`modules/wschat/utils/wschatSalesfarcePin.ts`), read by
  `salesfarceIsActiveState.ts`, set by `salesfarceEnter.ts` and cleared by
  `useColorScheme.ts` once Light, Dark or System is saved (that still reloads
  out of the theme). Without storage the theme just is not pinned. The
  "Enterprise only" badge is not shown (`SettingsAppearanceOption.tsx`).
- The service user is never offered as a person to pick (assignee, owner,
  account owner, "@" mentions, member filters, the members page); records it
  already authored keep "WSChat". Three server edits, the address read from
  `WSCHAT_BRIDGE_SERVICE_USER_EMAIL`
  (`wschat-bridge/utils/exclude-wschat-service-member.util.ts`):
  `search/services/search.service.ts` (record pickers and mentions go through
  `search`, which runs no query hooks), `user/user.resolver.ts`
  (`workspaceMembers` of the current user, the local member list of the front)
  and the module's own `workspaceMember.findMany` pre-query hook, for people in
  the app only: WSChat reads the full list with its records key.
- `twenty-front`, Russian: boolean values read «Да»/«Нет» instead of
  «Истина»/«Ложь» (`locales/ru-RU.po`, `True`, `False`, `True or false`, and the
  compiled `locales/generated/ru-RU.ts`; the image recompiles from the `.po`).
  An upstream catalog update brings them back: `wschatRussianBooleanLabels.test.tsx`
  fails then.
- Russian wording, front and server `ru-RU.po` (translations only, plus the
  compiled `locales/generated/ru-RU.ts` of each): phrases with a field or object
  name put in read right for any name (`Создать: Задача`, `Не выбрано`,
  `Ничего не найдено`, command menu items), and true/false read «Да»/«Нет»
  (`Count true`, `Probability of true`, field type `True/False`). Workflow forms
  translate their boolean options (`FormBooleanFieldInput.tsx`, `t` around
  `True`/`False`); the confirm button of permanent deletion reuses the title's
  phrase instead of gluing `Permanently Destroy` and the name
  (`DestroyRecordsCommand.tsx`). `wschatRussianCatalogFixes.test.ts` lists every changed
  string and fails when a catalog update brings the shipped text back.
- Icon `IconWschat` (WSChat's favicon, own colours on both themes) for our
  fields: `twenty-ui` `IconsProvider.tsx` takes `extraIcons` added to the
  registry, `App.tsx` passes `modules/wschat/constants/WschatIcons.ts`.
- `.github/workflows/wschat-check.yml`: typecheck, unit tests and lint for the
  bridge module and the front changes on every push to a `wschat/**` branch
  (the image build itself does not typecheck).
- `.github/workflows/wschat-build-image.yml`: builds the official
  `packages/twenty-docker/twenty/Dockerfile` (target `twenty`, `linux/amd64`)
  when a `wschat-v*` tag is pushed, and attaches the gzipped `docker save`
  archive and its SHA-256 to the GitHub Release of that tag.

Everything else is unchanged upstream code. Licence: AGPL-3.0, as upstream; this
fork's source is published here in accordance with it. Upstream files under the
Twenty enterprise licence are untouched.

## Embedding host messages

When the CRM runs in an iframe, a plain click on a link whose origin is the
parent page's origin sends, CRM to host, `{ type: 'wschat:open-link', url: string }`
via `postMessage` to that origin only, and does not navigate. The parent origin
comes from `location.ancestorOrigins[0]` (Firefox: `document.referrer`); it is
trusted because `frame-ancestors` admits only the workspace's
`allowedEmbeddingOrigins`. Standalone tabs, other origins and modifier or middle
clicks behave as upstream. WSChat listens for the message and opens the dialog.
