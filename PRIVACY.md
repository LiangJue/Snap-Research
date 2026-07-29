# Privacy Policy

**Last Updated: July 29, 2026**

This Privacy Policy applies to **Snap Research**, a browser extension based on SyncNos WebClipper.

## 1. Purpose

Snap Research helps users capture visible webpage content, investigate selected claims, save structured evidence reports locally, collect supported AI conversations and web articles, and optionally export or sync selected content.

## 2. Data the extension may access

When you trigger a capture or use a supported collection feature, the extension may read content visible to you on the current page, including:

- a screenshot region selected by you;
- selected text and nearby DOM text;
- a research question or context that you enter;
- rendered AI conversation messages;
- article text, title, URL, author, and publication metadata;
- image URLs embedded in captured content;
- local comments, quoted text, and locator metadata that you create.

The extension does not need or intentionally read ChatGPT or Kimi account passwords, authentication cookies, or OpenAI API keys from webpages.

When you choose the raw-screenshot ChatGPT or Kimi path, Snap Research uses clipboard write access to place only the selected image on your clipboard. It opens the selected service and writes the research prompt into the composer without sending it. The screenshot reaches that service when you paste it, and nothing is submitted until you send the message.

## 3. Local storage

Snap Research is local-first:

- reports, tasks, screenshots, Evidence Cards, judgments, conversations, articles, and comments are stored in browser IndexedDB;
- settings and small UI state are stored in extension-local browser storage;
- backup and export packages are created locally;
- sensitive OAuth tokens are excluded from normal backup exports.

Removing the extension may remove its local browser data unless you export a backup first.

## 4. Research through ChatGPT or Kimi

If you choose the ChatGPT or Kimi research path:

- in the claim-first path, the extension creates a prompt containing the extracted source, research context, Report ID, and Task IDs;
- in the raw-screenshot path, the extension places the selected screenshot on your clipboard and writes a claim-splitting research prompt into the selected web composer;
- you paste and manually send that content through your own ChatGPT or Kimi session;
- after you request an import, the extension reads the conversation content currently rendered on that page and looks for a matching structured assistant response;
- you preview the match before confirming that it should be saved.

The extension does not automatically submit the prompt and does not read ChatGPT or Kimi credentials or cookies. Content sent through either service is governed by that provider's own terms and privacy policy.

## 5. Research through the optional API

If you choose the API research path:

- the selected screenshot or text, extracted DOM text, claim, question, and research context are sent to the configured Research API endpoint;
- the included local prototype server forwards the required content to the OpenAI Responses API for model processing and web search;
- the OpenAI API key remains in the server process environment and is not sent to or stored by the extension;
- requests sent by the included server use `store: false`;
- the prototype server keeps jobs, results, and quota counters only in process memory and expires completed jobs.

OpenAI's processing of API data is governed by its applicable terms and privacy commitments. Operators who deploy their own Research API are responsible for publishing accurate privacy and security disclosures for that deployment.

## 6. Optional sync and export

Data is sent to another service only when you configure and trigger the corresponding feature:

- **Notion:** selected conversations, articles, comments, metadata, and supported images may be sent through the Notion API.
- **Feishu/Lark:** selected saved content may be sent through the configured Feishu integration.
- **Obsidian:** selected content is sent to the locally configured Obsidian REST API.
- **Markdown/ZIP:** files are generated locally for you to store or transfer.

Third-party services process data under their own privacy policies.

## 7. OAuth and token exchange

Inherited Notion and Feishu integrations may use token-exchange endpoints so client secrets do not need to be embedded in the extension. These endpoints receive the information required to complete the selected OAuth flow. They are not intended to receive Research screenshots or Evidence Cards unless separately documented by the operator.

The packaged v0.3.3 Chrome build still uses the upstream SyncNos Notion OAuth
client, redirect page, and token-exchange proxy when a user explicitly chooses
**Connect Notion**. That optional OAuth flow therefore depends on infrastructure
operated by the upstream project, not by Snap Research. Do not use that button
unless you accept that trust boundary. The core local capture and ChatGPT
research path does not call this OAuth endpoint.

Feishu OAuth has no token-exchange proxy configured in the default build. Users
who configure a proxy or client credentials are responsible for trusting and
securing that configuration.

## 8. Permissions

The Chrome build currently requests:

- **storage:** save settings and small extension state;
- **activeTab:** access the page only after a user action such as capture;
- **contextMenus:** provide selected-text and page capture actions;
- **tabs / tabGroups / webNavigation:** open or focus supported pages and coordinate inherited tab-group workflows;
- **scripting:** inject the packaged capture overlay, collector, and in-page sidebar;
- **alarms:** resume polling for asynchronous Research API jobs;
- **clipboardWrite:** copy a user-selected screenshot or explicitly requested text;
- **declarativeNetRequestWithHostAccess:** support inherited image anti-hotlink handling;
- **`http://*/*` and `https://*/*` host access:** allow user-triggered capture and inherited WebClipper features on arbitrary webpages.

Broad `http://*/*` and `https://*/*` host access supports user-triggered capture on arbitrary webpages and inherited WebClipper features. Snap Research does not use host access to collect browsing history for advertising.

## 9. Remote code

The extension does not download and execute remote JavaScript. Executable extension code is packaged in the build. Network requests exchange data only for features you choose to use.

## 10. Data sale and advertising

Snap Research does not sell personal data and does not include advertising or behavioral tracking.

## 11. Contact

Questions and reports can be submitted through:

- <https://github.com/LiangJue/Snap-Research/issues>
