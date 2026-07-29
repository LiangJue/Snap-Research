# Dependency security audit for v0.3.3

Audit date: 2026-07-29

## Remediated advisories

The candidate upgrades:

- `defuddle` to `0.19.2`;
- `mathml-to-latex` to `1.8.0`;
- `@xmldom/xmldom` to `0.9.10`;
- `markdown-it` to `14.3.0`;
- `linkify-it` to `5.0.2`;
- `react-router-dom` and `react-router` to `7.18.2`.
- the build and test toolchain to WXT `0.21.2`, Vite `7.3.6`, Vitest
  `4.1.10`, ESLint `10.8.0`, PostCSS `8.5.25`, and maintained companion
  packages.

These upgrades remove the previously reported XML recursion/injection,
linkification complexity, Markdown smart-quotes complexity, redirect, XSS, and
older React Router advisories. They also remove the Critical, High, and
Moderate advisories that GitHub initially reported through the inherited
development and build dependency graph.

## Remaining npm advisory and applicability

The full `npm audit` dependency graph still reports
`GHSA-qwww-vcr4-c8h2` against React Router. The advisory concerns React Server
Components Action handling: a request may execute an RSC Action before the
server returns a CSRF-related 400 response.

Snap Research does not run a React Router server, RSC request handler, framework
Action, loader, static handler, or server-rendering runtime. It is a static
Chrome Manifest V3 bundle and imports only these client APIs from
`react-router-dom`:

- `HashRouter`;
- `Link`;
- `Navigate`;
- `Route`;
- `Routes`;
- `useLocation`;
- `useNavigate`.

Therefore the vulnerable server/RSC code path is not reachable in the packaged
extension. `.github/scripts/webclipper/verify-dependency-audit.mjs` makes this
exception reproducible: it fails if any other dependency advisory appears, if a
server/RSC Router API is introduced, or if an unreviewed Router import is added.

This is a scoped non-applicability decision, not a claim that npm reports zero
advisories. Re-evaluate it whenever Router usage or the extension architecture
changes.
