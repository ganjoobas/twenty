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
