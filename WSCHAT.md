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
- `auth/constants/max-workspaces-without-organization-key.constant.ts`: the
  number of workspaces allowed without an enterprise key is raised from 5 to
  10000, because every WSChat client company gets its own workspace.
- `.github/workflows/wschat-check.yml`: typecheck, unit tests and lint for the
  bridge module on every push to a `wschat/**` branch (the image build itself
  does not typecheck).
- `.github/workflows/wschat-build-image.yml`: builds the official
  `packages/twenty-docker/twenty/Dockerfile` (target `twenty`, `linux/amd64`)
  when a `wschat-v*` tag is pushed, and attaches the gzipped `docker save`
  archive and its SHA-256 to the GitHub Release of that tag.

Everything else is unchanged upstream code. Licence: AGPL-3.0, as upstream; this
fork's source is published here in accordance with it. Upstream files under the
Twenty enterprise licence are untouched.
