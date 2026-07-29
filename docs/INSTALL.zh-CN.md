# 安装 Snap Research

[English guide](INSTALL.md)

Snap Research 当前通过 Chrome“加载已解压的扩展程序”安装，尚未上架 Chrome
Web Store。

## 选择安装方式

### 使用打包版本

如果 Releases 页面已经提供你需要的版本：

1. 打开仓库的 **Releases** 页面；
2. 下载对应版本的 Chrome ZIP；
3. 解压到一个长期保留的文件夹；
4. 确认解压后的文件夹里直接包含 `manifest.json`；
5. 打开 `chrome://extensions`；
6. 开启“开发者模式”；
7. 点击“加载已解压的扩展程序”，选择该文件夹；
8. 在 Chrome 扩展菜单中固定 Snap Research。

插件仍在使用时，不要删除或移动这个解压文件夹。

### 从源码构建

需要：

- Chrome、Edge、Brave、Arc 或其他 Chromium 浏览器；
- Node.js 22 或更新版本；
- Git。

```powershell
git clone https://github.com/LiangJue/Snap-Research.git
cd Snap-Research
npm ci
npm run build
```

按照上面的 Chrome 步骤加载 `.output/chrome-mv3`。使用“截图直送
ChatGPT”或“截图直送 Kimi”都不需要 OpenAI API Key。

## 第一次进行无 API 截图研究

1. 打开一个包含待核查内容的普通网页；
2. 打开 Snap Research，点击“截图并研究”；
3. 框选需要研究的内容；
4. 根据需要填写一句补充研究问题；
5. 点击“截图直送 ChatGPT（无需 API）”；
6. 等待 ChatGPT 打开，并确认输入框内已经出现研究提示词；
7. 按一次 `Ctrl+V` 粘贴截图；
8. 确认同一个输入框内同时有截图和提示词，再手动发送；
9. 等待研究完成；
10. 在该 ChatGPT 页面打开 Snap Research，点击“导入当前 ChatGPT 研究”；
11. 检查预览内容，确认无误后再导入。

如果使用 Kimi，第 5 步改为点击“截图直送 Kimi（无需 API）”。Snap
Research 会打开 `kimi.com` 并写入同一套结构化提示词，但不会发送。请先在
Kimi 中确认你要使用的模型和 Thinking effort，按 `Ctrl+V` 粘贴截图后手动
发送；回答完成后，在该页面点击“导入当前 Kimi 研究”。

插件不会自动发送 ChatGPT 或 Kimi 消息。提示词写入完成后，输入框完全交给
对应网页管理。

## 可选的本地 Research API

只有 API 研究路径需要 OpenAI API Key：

```powershell
$env:OPENAI_API_KEY='your-key'
npm run research:server
```

进行 API 研究时需要保持该终端运行。默认地址为
`http://127.0.0.1:8787/v1/research`。

不要把真实 API Key 写进插件代码、浏览器存储、`.env.example` 或任何提交到
Git 的文件。

## 更新已解压安装

1. 如果本地资料重要，先在 Snap Research 中导出 ZIP 备份；
2. 下载新版 ZIP，清空长期保留的插件目录中的旧打包文件，再把新版文件解压到同一个目录；或者重新构建源码；
3. 打开 `chrome://extensions`；
4. 在 Snap Research 卡片上点击“重新加载”；
5. 刷新此前已经打开的网页、ChatGPT 和 Kimi 标签页。

## 常见问题

- **提示词没有写入：** 重新加载扩展并刷新 ChatGPT 或 Kimi 页面。Research Report
  中仍保留手动复制提示词的备用入口。
- **截图没有粘贴：** 回到已经准备好的 ChatGPT 输入框，按 `Ctrl+V`。插件有意将
  图片和提示词分开交付。
- **输入框里只有截图或只有文字：** 暂时不要发送，确认二者同时出现。
- **找不到研究结果：** 等待 ChatGPT 或 Kimi 完成回答，将最终结构化结果保留在当前页面，
  再重新点击导入预览。
- **导入被拒绝：** 确认结果属于当前 Report，并且回答包含完整 JSON 对象。
- **需要保留本地资料：** 卸载扩展前先导出备份；卸载可能删除 IndexedDB 数据。

数据处理和权限说明见 [PRIVACY.md](../PRIVACY.md)，功能与限制见
[README.zh-CN.md](../README.zh-CN.md)。
