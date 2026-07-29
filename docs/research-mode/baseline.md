# Snap Research upstream baseline

Recorded on 2026-07-23 before Snap Research implementation.

## Source

- Repository: `SyncNos/SyncNos-Webclipper`
- Release: `v1.9.1`
- Commit: `50598f40636558a5526cf24b28c13b073c640c61`
- Release commit date: 2026-06-30
- Local branch: `codex/research-mode`
- License: AGPL-3.0 (`LICENSE.APGLv3` in the upstream repository)

The code-backed user feature inventory for this pinned upstream release is maintained in
`docs/upstream-syncnos-feature-inventory.md`. New Snap Research work must check that inventory and
the actual `v1.9.1` code before introducing a parallel implementation.

The prototype is intentionally pinned to the latest stable release observed at the
start of implementation. Untagged changes on `main` are not included.

## Local environment

- Windows / PowerShell
- Node.js: `v24.16.0`
- npm: `11.13.0`
- WXT: `0.20.18`
- React: `19.2.4`
- TypeScript: `5.9.3`
- Vitest: `2.1.8`

The repository requests Node 22 type definitions. This local run uses Node 24, which
may contribute to the UI/jsdom baseline failures below.

## Verification

| Command | Result |
| --- | --- |
| `npm install --prefer-offline --no-audit --no-fund` | Passed |
| `npm run compile` | Passed |
| `npm run build` | Passed; Chrome MV3 output created in `.output/chrome-mv3` |
| `npm test` | Upstream baseline failed: 15 failed, 875 passed, 4 unhandled errors |

The number of failing tests fluctuated between 14 and 15 across repeated full-suite
runs. No Snap Research code existed during these runs.

Observed failing tests:

- `tests/smoke/app-shell-comments-sidebar.test.ts` (1)
- `tests/smoke/clipper-context-menu-save-title.test.ts` (1, intermittent)
- `tests/smoke/content-controller-inpage-combo.test.ts` (2)
- `tests/smoke/conversations-scene-narrow-comments-flow.test.ts` (2)
- `tests/smoke/conversations-scene-popup-escape.test.ts` (2)
- `tests/smoke/conversations-sync-feedback.test.ts` (2)
- `tests/smoke/detail-header-actions.test.ts` (1)
- `tests/smoke/popup-shell-header-actions.test.ts` (2)
- `tests/unit/settings-sections.test.ts` (2)

The failures are concentrated in localization-sensitive selectors, async React UI
tests, and jsdom teardown (`window is not defined`). They are treated as upstream
baseline debt, not as acceptance criteria for the first Snap Research slice.

## Change acceptance rule

Every Snap Research increment must:

1. pass its new focused tests;
2. pass `npm run compile`;
3. pass `npm run build`;
4. not add failures outside the recorded upstream baseline.

Before release packaging, rerun the complete suite and compare the result with this
document.
