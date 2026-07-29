# Security Policy

## Supported version

Security fixes are provided for the latest published Snap Research release.
Older private test releases are not supported.

## Reporting a vulnerability

For a security vulnerability, use GitHub's **Report a vulnerability** option in
the repository Security tab. Do not open a public Issue containing exploit
details, credentials, private browsing data, Research Reports, screenshots, or
other user content.

For a non-sensitive bug, use the repository Issue template.

Please include:

- the affected Snap Research version;
- the browser and operating system;
- the smallest reproducible sequence;
- the expected and observed behavior;
- a redacted proof of impact, if one is necessary.

Never include real API keys, OAuth tokens, cookies, passwords, personal data, or
unedited user research material. Snap Research maintainers will acknowledge a
valid private report and coordinate remediation and disclosure through the
GitHub advisory.

## Security scope

The packaged Chrome extension is the supported release artifact. The optional
local Research API is a prototype without production authentication and should
not be exposed directly to untrusted networks.
