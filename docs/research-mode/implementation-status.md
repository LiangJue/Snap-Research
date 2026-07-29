# Snap Research implementation status

Updated: 2026-07-28

## Implemented vertical slice

The prototype now supports this complete local flow:

1. open the extension popup and choose `区域研究`;
2. drag-select one region on the current page;
3. optionally enter one short research question;
4. save the cropped screenshot and selected-region DOM text locally;
5. create a durable research task and submit an asynchronous backend job;
6. resume/poll the job after a Manifest V3 service-worker restart;
7. validate source URLs and numerical evidence before creating the card;
8. show a structured Evidence Card in the existing SyncNos library;
9. record the user's decision as `接受`, `继续核查`, or `不采纳`;
10. export/sync the Markdown projection through existing SyncNos paths.

Research tasks, cards, screenshots, and user judgment are included in SyncNos ZIP
backup/export. Provider credentials are not stored in the extension or its backup.

## Runtime shape

```text
web page
  -> Shadow DOM region capture
  -> extension IndexedDB (task + screenshot)
  -> local/deployed Research API (provider key stays here)
  -> asynchronous OpenAI Responses API job with web search
  -> strict result validation in the extension
  -> Evidence Card + SyncNos conversation projection
  -> local judgment / Markdown / Obsidian / Notion / Feishu
```

The default fixed model is `gpt-5.6-terra` with medium reasoning effort. It is
configurable on the server with `OPENAI_MODEL`; there is deliberately no model or
provider picker in the user interface.

The optional capture input labeled `补充研究范围或背景` is persisted as
`researchContext` on the Report capture shared by every Task. It is forwarded to
Candidate Claim extraction, the formal API research request, the Report summary,
and the ChatGPT structured prompt without changing the claim-specific `question`.

## Run locally

Install and build:

```powershell
npm install
npm run compile
npm run build
```

Start the prototype research API:

```powershell
$env:OPENAI_API_KEY='your-key'
npm run research:server
```

Load `.output/chrome-mv3` as an unpacked Chrome extension. The default endpoint is
`http://127.0.0.1:8787/v1/research`. A deployed build can override it:

```powershell
$env:SYNCNOS_RESEARCH_API_URL='https://your-api.example/v1/research'
npm run build
```

## Cost and privacy controls

- The provider key only exists on the server.
- Requests use `store: false`.
- The prototype server allows one active provider request at a time.
- The default cap is 20 Research Reports per UTC day per server process. Tasks and retries inside one Report share that use.
- Screenshot payloads and research results remain in server memory only while the
  job is active or awaiting pickup; completed jobs expire after 24 hours.
- Durable user data is stored locally by the extension.

For a public demo, replace the in-memory quota/job map with authenticated,
per-user durable storage and restrict CORS to the released extension ID.

## Verification completed

- Release-focused Research, ChatGPT/Kimi import, storage migration, backup, and UI regression: 38 files / 163 tests passed.
- TypeScript compile: passed.
- ESLint: passed.
- Chrome Manifest V3 production build and Chrome-safe encoding check: passed.
- Browser QA: region overlay, text selection, claim selection, Evidence Card rendering,
  in-page sidebar, reading controls, judgment input, and local judgment persistence passed.
- A live OpenAI Responses request completed and produced an Evidence Card.

The complete suite is not green. The July 28 run recorded 15 failures concentrated in
inherited localization expectations and React/jsdom UI selectors, plus asynchronous jsdom
shutdown errors. The release-focused Snap Research gate passes. See `baseline.md` for the
recorded upstream baseline.

The repository-wide Prettier check remains red because 658 upstream files are not
formatted according to the current Prettier version. Every file changed for
Snap Research passes a scoped Prettier check.

## ChatGPT account research bridge

Snap Research also supports no-API workflows using the user's existing ChatGPT
or Kimi session. For selected text, the initial dialog offers direct web-research
buttons before claim extraction. Those paths create a source-first Report, write
the selected text and structured claim-splitting/research prompt into the chosen
web composer, and never call the local Research API.

1. either send selected text directly, or after claim extraction choose ChatGPT
   or Kimi web research instead of the API action;
2. create the same durable Report and one waiting task per selected claim without
   starting a provider request;
3. write a structured prompt containing exact Report and Task IDs into the chosen
   ChatGPT or Kimi composer without sending it;
4. review the prompt and manually send it;
5. on the completed ChatGPT conversation, open the extension and choose
   `导入当前 ChatGPT 研究`;
6. reuse SyncNos's existing manual ChatGPT collector and virtual-list scroll sweep,
   locate the newest assistant message containing a matching structured Research
   payload, and show a task/evidence preview;
7. after confirmation, validate IDs, schema, source URLs, numeric fields, claim text,
   and question text before creating Evidence Cards. The user can also keep the full
   ChatGPT conversation as a normal SyncNos Conversation.
8. replace the Report's initial waiting placeholder with the imported claim checklist
   and completed import count while preserving the original screenshot reference.

The extension reads only the rendered conversation through the existing content-side
collector; it never reads ChatGPT credentials or cookies and does not automatically
submit a prompt. Manual JSON paste remains available as a recovery fallback. Imported
cards include a visible limitation stating that Snap Research did not independently
confirm whether ChatGPT actually visited the listed sources. The existing API workflow
remains available.

## Kimi account research bridge

The raw-screenshot no-API workflow is also available for Kimi:

1. choose `截图直送 Kimi（无需 API）`;
2. create a `kimi_screenshot` Research Report and copy the raw screenshot;
3. open `https://www.kimi.com/` and write the structured prompt without sending;
4. let the user confirm the Kimi model, paste the image, and send manually;
5. reuse the existing Kimi collector to preview and import the final JSON into the
   original Report and Evidence Cards.

The extension does not select a paid Kimi model, change thinking effort, or submit
the message. Those choices remain visible and user-controlled in Kimi. Once the
prompt is successfully written, the extension marks that prompt as complete for
the current page and no longer modifies the composer, including after Kimi clears
it on submission. When Kimi places tool-call JSON before the final answer in the
same assistant message, the importer scans all complete JSON objects and selects
the first one that satisfies the Snap Research result contract.

## Current prototype limitations

- There is no deployed backend or authentication yet.
- The local server's daily quota resets if the server process restarts.
- A backend restart can lose an in-flight in-memory job; the extension retries a
  missing job up to three attempts.
- Source-tier classification is partly model-supplied, then constrained by local
  URL, social-source, citation-presence, and numeric validation.
- The current card body reuses SyncNos's article reader; the judgment header is
  Snap Research-specific.

## API references used

- OpenAI Responses API web search:
  <https://developers.openai.com/api/docs/guides/tools-web-search>
- Structured outputs:
  <https://developers.openai.com/api/docs/guides/structured-outputs>
- Image inputs:
  <https://developers.openai.com/api/docs/guides/images-vision>
- Model selection:
  <https://developers.openai.com/api/docs/models>
