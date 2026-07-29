<div align="center">

# Snap Research

把网页截图或选中文字变成带来源、可判断、可保存的 Evidence Card。

[English](README.md) · [隐私说明](PRIVACY.md) · [AGPL-3.0](LICENSE.APGLv3)

</div>

## 它解决什么问题

Snap Research 是一个本地优先的 Chrome 插件，用于核查浏览网页时遇到的具体论点：

1. 框选当前网页区域，或通过右键菜单提交选中文字；
2. 可以检查、编辑提取出的候选论点，也可以把原始截图直接交给 ChatGPT 或 Kimi 拆分；
3. 通过 ChatGPT、Kimi 或本地 OpenAI Research API 分别研究论点；
4. 导入包含来源、局限和结论的结构化 Evidence Card；
5. 由用户明确选择“接受 / 标记待跟进 / 不采纳”；
6. 将 Report 保存在浏览器本地，并复用 Markdown、Obsidian、Notion、飞书和 ZIP 导出链路。

一个原始截图或文本只保存一次，对应一个 Research Report；每个被选中的论点分别创建独立 Research Task。结果保存前会校验数据结构、Task ID、HTTPS 来源、引用和数字证据。

## 两种研究路径

### 使用 ChatGPT 或 Kimi 账号

使用“截图直送 ChatGPT”或“截图直送 Kimi”时，这条路径不需要 API Key：

1. 框选截图区域，选择 `截图直送 ChatGPT（无需 API）`；
2. Snap Research 只把原始截图复制到剪贴板，同时打开 ChatGPT，并把结构化提示词写入输入框但不发送；
3. 在该输入框中粘贴截图，确认图片出现在提示词旁边后再发送；
4. ChatGPT 会优先拆分出 3–7 个不重复论点（10 个为硬上限），再根据论点类型和证据口径逐条研究；
5. 研究完成后，在该 ChatGPT 页面打开 Snap Research；
6. 预览并导入自动生成的 Task 和 Evidence Card。

选中文字后也可以在提取论点前直接选择 `文字直送 ChatGPT（无需 API）` 或 `文字直送 Kimi（无需 API）`，由对应网页 AI 读取原文、拆分论点并研究，整个流程不经过本地 Research API。你也可以先提取、编辑候选论点，再选择 ChatGPT 或 Kimi 网页研究；这一步“研究”本身不调用 Research API，但对无结构文字或截图进行候选论点提取时，可能会调用本地 Research API；如果原文包含至少两个连续编号项，则会在本地直接拆分。

Snap Research 只会在你主动点击复制时使用剪贴板写入权限。图片必须单独复制，因为富文本输入框可能会在同一个剪贴板项目的图片和文字格式中只选择文字。如果复制或提示词写入失败，Report 会保留原始截图，并显示提示词供你手动重试。

Snap Research 只会在你主动点击导入后读取当前页面已经渲染的聊天内容，不读取账号凭据或 Cookie，也不会自动发送消息。

### 使用本地 Research API

这条路径会在本机运行一个小型 Node.js 服务，API Key 只保存在服务进程环境中，不进入插件。服务使用 OpenAI Responses API 的图片输入、结构化输出和 Web Search。当前队列和配额属于原型实现，仅保存在进程内存。

## 安装

### 使用打包版本

1. 打开仓库的 **Releases** 页面，下载 `snap-research-v0.3.4-chrome.zip`；
2. 将 ZIP 解压到一个长期保留的文件夹，安装后不要删除该文件夹；
3. 打开 `chrome://extensions`；
4. 启用“开发者模式”；
5. 点击“加载已解压的扩展程序”，选择解压后包含 `manifest.json` 的文件夹；
6. 在浏览器扩展菜单中固定 Snap Research。

手动加载的扩展不会自动更新。更新前请先导出备份，然后下载新 ZIP，清空扩展长期目录中的旧打包文件，再把新文件解压到同一个目录，并在扩展管理页点击“重新加载”。沿用目录可以保留未打包扩展的身份，先清空旧文件可以避免残留无效的哈希 JavaScript 文件。

首次使用、更新、备份和常见故障排查见[详细安装指南](docs/INSTALL.zh-CN.md)。

### 从源码构建

需要：

- Chrome、Arc、Brave、Edge 或其他 Chromium 浏览器
- Node.js 22 或更新版本
- 仅在使用 API 研究路径时需要 OpenAI API Key

```powershell
git clone https://github.com/LiangJue/Snap-Research.git
cd Snap-Research
npm ci
npm run build
```

随后打开 `chrome://extensions`，启用“开发者模式”，点击“加载已解压的扩展程序”，选择：

```text
.output/chrome-mv3
```

当前项目尚未上架 Chrome Web Store。

`v0.3.4` 是当前公开版本。此前的 Private 测试安装包均已被替代，不应再用于新安装。

### 启动可选的本地 Research API

```powershell
$env:OPENAI_API_KEY='your-key'
npm run research:server
```

插件默认连接 `http://127.0.0.1:8787/v1/research`。如果需要其他地址，请在构建前设置：

```powershell
$env:SYNCNOS_RESEARCH_API_URL='https://your-api.example/v1/research'
npm run build
```

不要把真实 Key 写入 `.env.example`、插件代码、浏览器存储或任何提交到 Git 的文件。

## 本地优先，但研究行为会明确联网

Report、Task、截图、Evidence Card 和用户判断都持久保存在浏览器 IndexedDB。只有在你主动选择需要联网的功能时，相关内容才会离开浏览器：

- API 研究会把选中的截图/文字和补充背景发送到你配置的 Research API 和 OpenAI；
- 截图直送 ChatGPT 或 Kimi 只会把所选截图放入剪贴板，并把提示词写入对应网页输入框；粘贴时截图会传给对应服务，只有你主动发送后才会开始研究；
- 文字直送或先确认论点的 ChatGPT/Kimi 网页研究都会把原始材料和结构化提示词直接写入对应输入框，并由你确认后手动发送；
- Notion 和飞书同步会把你选择的内容发送到对应服务；
- Obsidian 同步会把你选择的内容发送到本机配置的 Obsidian REST API。

完整说明见 [PRIVACY.md](PRIVACY.md)。

## 复用的 WebClipper 能力

Snap Research 基于 [SyncNos WebClipper](https://github.com/SyncNos/SyncNos-Webclipper) `v1.9.1` 修改，保留了原项目的本地内容库以及多项 WebClipper 能力，包括 AI 对话和网页采集、搜索、评论、图片缓存、Markdown/ZIP 导出，以及可选的 Notion、Obsidian 和飞书同步。

Snap Research 在此基础上新增了截图到证据的完整流程、Research Report/Task 数据模型、异步研究任务、结果校验、Evidence Card、人工判断、Report 备份恢复、页内 Research 侧栏和 ChatGPT 研究导入。

## 验证与限制

当前 Release Gate 覆盖 TypeScript 编译、ESLint、有明确口径的完整依赖审计、Research/存储/备份/UI 定向测试、Chrome MV3 生产构建和 Chrome 编码检查。API 路径已实际生成并保存 Evidence Card；截图和纯文字两类输入也都分别通过 ChatGPT、Kimi 完成了提示词写入、网页研究、预览确认、导入和 Report 生成。

人工导入现在会经过确定性的 Research Quality Gate：不合法或与来源关系不符的证据等级会被保守降级；缺少证据支撑的状态会调整为 `insufficient`；疑似包含多个子命题的 `mixed` 会提示拆分；同一网址的背景证据不会覆盖直接支持或反证；不一致的变化率会被移除；系统检查与来源自身的局限分开展示。该门槛无法独立读取每一个网页，也不能保证网页 AI 覆盖了原文全部重要论点，因此最终仍需用户确认来源和结论。

已知限制：

- 可选 Research API 仍是本地服务，没有生产级认证；
- 队列、任务、结果和每日配额只保存在服务内存中；
- 服务重启可能丢失正在执行的任务；
- ChatGPT 与 Kimi 导入会校验结构、标识、网址、证据等级、状态支撑和数值关系，但无法独立证明网页 AI 是否实际访问并准确概括了每条来源；
- ChatGPT 界面变化可能导致提示词无法自动写入，因此发送前需要确认提示词和粘贴后的图片都已出现；
- Kimi 界面变化可能导致提示词写入或对话读取失败，因此同样需要确认输入，并在必要时使用 Report 内的手动导入备用入口；
- 继承自上游的完整测试套件仍有12项不在定向发布范围内的本地化/UI selector 失败；Snap Research 定向 Release Gate 通过；
- 当前版本证明了产品与工程闭环，不代表市场需求已经得到验证。

实现细节见 [docs/research-mode](docs/research-mode)。

## 许可证与来源

Snap Research 是 SyncNos WebClipper 的修改版本，继续以 [GNU Affero General Public License v3.0](LICENSE.APGLv3) 发布，并保留上游项目的版权和许可证信息。

如果你分发修改后的构建，或通过网络向用户提供修改后的 AGPL 程序，需要遵守 AGPL 及其相应源码义务。

## 致谢

- [SyncNos WebClipper](https://github.com/SyncNos/SyncNos-Webclipper) 及其贡献者
- 上游项目致谢的 [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper)
