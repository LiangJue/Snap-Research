# Install Snap Research

[中文安装指南](INSTALL.zh-CN.md)

Snap Research is currently distributed as an unpacked Chrome extension. It is
not yet available in the Chrome Web Store.

## Choose an installation method

### Packaged release

Use this when a release asset for the version you want is available:

1. Open the repository's **Releases** page.
2. Download the Chrome ZIP for the desired version.
3. Extract it to a permanent folder.
4. Confirm that `manifest.json` is directly inside the extracted folder.
5. Open `chrome://extensions`.
6. Enable **Developer mode**.
7. Select **Load unpacked** and choose that folder.
8. Pin Snap Research from Chrome's extensions menu.

Do not delete or move the extracted folder while the extension is installed.

### Build from source

Requirements:

- a Chromium browser such as Chrome, Edge, Brave, or Arc;
- Node.js 22 or newer;
- Git.

```powershell
git clone https://github.com/LiangJue/Snap-Research.git
cd Snap-Research
npm ci
npm run build
```

Load `.output/chrome-mv3` through `chrome://extensions` as described above.
An OpenAI API key is not required for the ChatGPT or Kimi screenshot path.

## First no-API screenshot research

1. Open a normal webpage containing a claim you want to investigate.
2. Open Snap Research and select **Capture & Research**.
3. Draw a rectangle around the relevant content.
4. Optionally add a short research question.
5. Choose **截图直送 ChatGPT（无需 API）**.
6. Wait for ChatGPT to open with the research prompt already in its composer.
7. Press `Ctrl+V` once to paste the screenshot.
8. Confirm that both the image and prompt are visible, then send manually.
9. Wait for the research response to finish.
10. Open Snap Research on that ChatGPT page and select
    **导入当前 ChatGPT 研究**.
11. Review the preview before confirming the import.

For Kimi, choose **截图直送 Kimi（无需 API）** in step 5. Snap Research opens
`kimi.com` and writes the same structured prompt. Keep your preferred Kimi model
and thinking level selected, paste the copied screenshot, send manually, then
choose **导入当前 Kimi 研究** when the response is complete.

The extension does not automatically send the ChatGPT or Kimi message. After the
prompt is inserted, the web app exclusively controls the composer.

## Optional local Research API

Only the API research path needs an OpenAI API key:

```powershell
$env:OPENAI_API_KEY='your-key'
npm run research:server
```

Keep that terminal open while API research runs. The default endpoint is
`http://127.0.0.1:8787/v1/research`.

Never place a real API key in extension code, browser storage, `.env.example`,
or another committed file.

## Update an unpacked installation

1. Export a ZIP backup from Snap Research if the saved library matters to you.
2. Download the new release, remove the old packaged files from the permanent
   extension folder, and extract the new files into that same folder; or rebuild
   the source checkout.
3. Open `chrome://extensions`.
4. Select **Reload** on the Snap Research card.
5. Refresh any webpage, ChatGPT, and Kimi tabs that were already open.

## Troubleshooting

- **The prompt was not inserted:** reload the extension and refresh the ChatGPT
  or Kimi tab. The Research Report keeps a manual-copy fallback.
- **The screenshot was not attached:** return to the prepared ChatGPT composer
  and press `Ctrl+V`; the extension deliberately copies the image separately.
- **Only an image or only text is visible:** do not send yet. Confirm that both
  are present in the same composer.
- **No research result is found:** wait for ChatGPT or Kimi to finish, keep the
  final structured response on the current page, and try the import preview
  again.
- **An import is rejected:** verify that the result belongs to the same Report
  and that the response contains the complete JSON object.
- **Local data matters:** export a backup before removing the extension.
  Removing it may delete its IndexedDB data.

See [PRIVACY.md](../PRIVACY.md) for data handling and permissions, and
[README.md](../README.md) for capabilities and limitations.
