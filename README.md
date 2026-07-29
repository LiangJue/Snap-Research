<div align="center">

# Snap Research

Turn a screenshot region or selected text into structured, source-backed evidence cards.

[中文](README.zh-CN.md) · [Privacy](PRIVACY.md) · [AGPL-3.0](LICENSE.APGLv3)

</div>

## What it does

Snap Research is a local-first Chrome extension for investigating claims found while browsing:

1. capture a region of the current page or select text from the context menu;
2. either review extracted candidate claims or send the raw screenshot to ChatGPT or Kimi for claim splitting;
3. research each claim through ChatGPT, Kimi, or a local OpenAI-powered research service;
4. import a structured Evidence Card with sources, limitations, and a conclusion;
5. record your own judgment: accept, follow up, or reject;
6. keep the report in the browser and export it through the inherited Markdown, Obsidian, Notion, Feishu, or ZIP workflows.

The extension keeps one captured source in a Research Report and creates one independent Research Task per selected claim. It validates result structure, task IDs, HTTPS source URLs, citation presence, and numerical evidence before saving a card.

## Two research paths

### ChatGPT or Kimi account

The raw-screenshot fallback does not require an API key:

1. draw a screenshot region and choose `Send screenshot to ChatGPT (no API)`;
2. Snap Research copies only the raw screenshot, opens ChatGPT, and writes the structured prompt into the composer without sending it;
3. paste the screenshot into that composer and confirm that the image appears alongside the prompt before sending;
4. ChatGPT prefers three to seven distinct claims, with ten as a hard ceiling, then researches each one using claim-type and evidence-scope rules;
5. when the response is ready, open Snap Research on that ChatGPT page;
6. preview and import the generated tasks and evidence.

The same screenshot-first path is available through `Send screenshot to Kimi
(no API)`. Snap Research opens `kimi.com`, writes the prompt without sending it,
and reuses the existing Kimi conversation collector for the final structured
import. After the first successful write, Snap Research relinquishes the composer
so Kimi can clear it after submission without the prompt being restored. Select
the Kimi model and thinking level you want before sending.

Selected text can also be sent directly through `Send text to ChatGPT (no API)` or `Send text to Kimi (no API)` before claim extraction. The selected source text, claim-splitting instructions, and research contract are written into the chosen web composer, so this path does not use the local Research API. You can still extract and edit claims first, then choose ChatGPT or Kimi web research. That research step does not use the Research API, but extracting claims from unstructured text or screenshots may use the local Research API. Numbered lists with at least two items are split locally.

Snap Research uses clipboard write access only when you trigger a copy action. The image is kept separate because rich editors may choose text instead of image when both are clipboard representations of one item. If copying or prompt insertion fails, the Report keeps the original screenshot and shows the prompt for manual retry.

Snap Research reads only the conversation rendered in the current page after you trigger the import. It does not read account credentials or cookies and does not send prompts automatically.

### Local Research API

This path runs a small local Node.js service that keeps the OpenAI API key outside the extension. The service uses the OpenAI Responses API with image input, structured output, and web search. Jobs and quotas are prototype-grade and remain in process memory.

## Install

### Install the packaged build

1. Open the repository's **Releases** page and download `snap-research-v0.3.4-chrome.zip`.
2. Extract the ZIP to a permanent folder. Do not delete that folder after installation.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Choose **Load unpacked** and select the extracted folder that contains `manifest.json`.
6. Pin Snap Research from the browser's extensions menu.

Chrome does not automatically update manually loaded extensions. Before updating,
export a backup. Download the new ZIP, remove the old packaged files from the
extension's permanent folder, extract the new files into that same folder, and
click **Reload** on the extension management page. Reusing the folder preserves
the unpacked extension identity; clearing its old packaged files prevents stale
hashed JavaScript chunks from accumulating.

For first-use steps, updates, backup advice, and troubleshooting, see the
[detailed installation guide](docs/INSTALL.md).

### Build from source

Requirements:

- Chrome, Arc, Brave, Edge, or another Chromium browser
- Node.js 22 or newer
- an OpenAI API key only if you want to use the API research path

```powershell
git clone https://github.com/LiangJue/Snap-Research.git
cd Snap-Research
npm ci
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select:

```text
.output/chrome-mv3
```

This repository is not currently published in the Chrome Web Store.

`v0.3.4` is the current public release. Earlier private test packages are
superseded and should not be used for new installations.

### Start the optional local Research API

```powershell
$env:OPENAI_API_KEY='your-key'
npm run research:server
```

The extension defaults to `http://127.0.0.1:8787/v1/research`. To use another endpoint, set `SYNCNOS_RESEARCH_API_URL` before building:

```powershell
$env:SYNCNOS_RESEARCH_API_URL='https://your-api.example/v1/research'
npm run build
```

Never put a real key in `.env.example`, extension code, browser storage, or a committed file.

## Local-first, with explicit remote research

Reports, tasks, screenshots, cards, and judgments are stored in browser IndexedDB. They leave the browser only when you choose a feature that requires it:

- API research sends the selected screenshot/text and research context to the configured Research API and OpenAI.
- raw-screenshot ChatGPT or Kimi research places only the selected screenshot on your clipboard and writes the prompt into the selected web composer; the screenshot is sent only when you paste and manually send the message;
- text-first and claim-first ChatGPT/Kimi research place the source material and structured prompt in the chosen web composer for manual confirmation and sending;
- Notion and Feishu sync send selected saved content to those services.
- Obsidian sync sends selected content to the locally configured Obsidian REST API.

See [PRIVACY.md](PRIVACY.md) for the full disclosure.

## Inherited WebClipper capabilities

Snap Research is based on [SyncNos WebClipper](https://github.com/SyncNos/SyncNos-Webclipper) `v1.9.1`. It retains the original local library and many WebClipper capabilities, including AI conversation and article capture, search, comments, local image caching, Markdown/ZIP export, and optional Notion, Obsidian, and Feishu sync.

Snap Research extends that foundation with the capture-to-evidence workflow, Research Report/Task data model, asynchronous research jobs, result validation, Evidence Card UI, user judgments, report backup/restore, an in-page research sidebar, and the ChatGPT/Kimi import bridge.

## Validation and limitations

The release gate covers TypeScript compilation, ESLint, a documented full
dependency audit, focused Research/storage/backup/UI tests, the production Chrome
MV3 build, and a Chrome-safe encoding check. The API workflow has produced and
saved a real Evidence Card. Screenshot-first and selected-text research have each
completed prompt delivery, web research, preview, confirmed import, and Report
generation through both ChatGPT and Kimi.

Manual imports now pass a deterministic Research Quality Gate: invalid or
source-inconsistent evidence tiers are conservatively downgraded, unsupported
statuses are reduced to `insufficient`, suspicious compound `mixed` claims are
flagged for splitting, duplicate URLs cannot let context overwrite direct
support/counter evidence, inconsistent derived change rates are removed, and
system checks are displayed separately from source limitations. This gate cannot
independently read every cited page or guarantee that a web AI covered every
important claim, so final source and conclusion review remains a user decision.

Known limitations:

- the optional Research API is local and has no production authentication;
- its queue, jobs, results, and daily quota are stored only in server memory;
- a server restart can lose an in-flight job;
- ChatGPT and Kimi imports validate structure, identifiers, URLs, evidence tiers,
  status support, and numeric relationships but cannot independently prove that
  the web AI visited every reported source or summarized it correctly;
- ChatGPT interface changes may prevent automatic prompt insertion, so confirm that both the prompt and pasted image appear before sending;
- Kimi interface changes may prevent prompt insertion or conversation capture, so confirm the same two inputs and use the Report's manual fallback if needed;
- the complete inherited test suite still has 12 localization/UI-selector
  failures outside the focused release scope, while the Snap Research release
  gate passes;
- this release demonstrates a working product and engineering loop, not validated market demand.

Implementation details are documented in [docs/research-mode](docs/research-mode).

## License and attribution

Snap Research is a modified version of SyncNos WebClipper and is distributed under the [GNU Affero General Public License v3.0](LICENSE.APGLv3). Copyright and license notices from the upstream project are retained.

If you distribute a modified build or make a modified AGPL-covered version available for remote network use, you must comply with the AGPL, including the applicable source-code obligations.

## Acknowledgements

- [SyncNos WebClipper](https://github.com/SyncNos/SyncNos-Webclipper) by the SyncNos contributors
- [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) for inspiration acknowledged by the upstream project
