# SyncNos v1.9.1 功能基线清单

这份清单记录 Snap Research 开始开发时，原版 SyncNos WebClipper 已经具备的用户功能。
它的用途是防止在衍生项目中重复造轮子：新增功能前先查本清单，再从当前代码和上游
tag 验证实际接口。

## 基线与核对方法

- 上游仓库：`SyncNos/SyncNos-Webclipper`
- 固定版本：`v1.9.1`
- 固定 commit：`50598f40636558a5526cf24b28c13b073c640c61`
- 许可证：AGPL-3.0
- 上游功能事实优先级：`v1.9.1` 代码 > `v1.9.1` README > 本清单
- 查看原版文件：`git show v1.9.1:<path>`
- 查看原版文件列表：`git ls-tree -r --name-only v1.9.1 <path>`

本清单覆盖用户可感知的功能族和关键平台能力，不把每个内部函数、文案或视觉控件列成
独立功能。若发现遗漏，应先用上游代码验证，再补充本文件。

## 1. AI 对话采集

| 功能 | 原版行为 | 主要真源 |
| --- | --- | --- |
| ChatGPT 采集 | 手动抓取完整当前对话；支持虚拟列表滚动扫描、Markdown、图片及 Deep Research iframe 水合 | `src/collectors/chatgpt/**` |
| Claude 采集 | 采集用户与助手消息、Markdown 和图片 | `src/collectors/claude/**` |
| Gemini 采集 | 采集普通对话与研究内容 | `src/collectors/gemini/**` |
| Google AI Studio 采集 | 手动保存优先；避免虚拟列表导致自动采集遗漏 | `src/collectors/googleaistudio/**` |
| DeepSeek 采集 | 自动采集对话和 Markdown | `src/collectors/deepseek/**` |
| Kimi 采集 | 自动采集对话和 Markdown | `src/collectors/kimi/**` |
| 豆包采集 | 自动采集对话和 Markdown | `src/collectors/doubao/**` |
| 元宝采集 | 自动采集对话和 Markdown | `src/collectors/yuanbao/**` |
| Poe 采集 | 自动采集对话和 Markdown | `src/collectors/poe/**` |
| Notion AI 采集 | 自动采集对话和 Markdown | `src/collectors/notionai/**` |
| z.ai 采集 | 自动采集对话和 Markdown | `src/collectors/zai/**` |
| 自动采集控制 | 支持站点后台增量采集；ChatGPT 与 Google AI Studio 因虚拟列表限制只走手动全量抓取 | `src/collectors/ai-chat-sites.ts`、`src/services/bootstrap/content-controller.ts` |
| 增量与去重 | 使用稳定 conversation/message key 合并更新，避免重复保存已有消息 | `src/services/conversations/**` |
| 公式和 Markdown | 各 collector 保留结构化 Markdown，并处理页面中的数学公式 | `src/collectors/*/*-markdown.ts`、`src/collectors/formula-utils.ts` |
| AI 对话图片缓存 | 可配置自动缓存，也可在详情页补全历史图片 | `src/services/images/**`、`src/ui/reader/**` |

## 2. 网页文章采集

| 功能 | 原版行为 | 主要真源 |
| --- | --- | --- |
| 通用网页正文抓取 | 对任意 HTTP(S) 页面提取正文、标题、作者、日期和 Markdown | `src/collectors/web/**` |
| 智能当前页抓取 | popup 自动判断当前页是 AI 对话还是网页文章，并调用对应 collector | `src/services/bootstrap/current-page-capture.ts` |
| 站点专用解析 | 对微信、Discourse、小红书等提供专用正文规则 | `src/collectors/web/article-extract/sites/**` |
| 后台文章获取 | 对部分站点使用后台请求或站点专用 fetch 逻辑 | `src/collectors/web/article-fetch-sites/**` |
| 文章图片缓存 | 可选缓存网页图片；缓存失败不阻断正文保存 | `src/services/images/**` |
| 反防盗链缓存 | 命中域名规则时自动补 referer 并缓存图片 | `src/services/integrations/anti-hotlink/**` |

## 3. 视频字幕

| 功能 | 原版行为 | 主要真源 |
| --- | --- | --- |
| YouTube 字幕 | 保存页面已经加载的字幕或转录，尽量保留时间戳 | `src/collectors/video/**` |
| Bilibili 字幕 | 保存页面已经加载的字幕或转录，尽量保留时间戳 | `src/collectors/video/**` |
| 视频独立分类与输出 | 视频条目在本地列表、Notion、Obsidian、飞书中使用独立目标或目录 | `src/ui/settings/sections/VideosSection.tsx`、`src/services/sync/**` |

## 4. 本地资料库与阅读

| 功能 | 原版行为 | 主要真源 |
| --- | --- | --- |
| 本地优先存储 | 对话、文章、视频、消息、图片和评论先写入 IndexedDB | `src/platform/idb/**`、`src/services/conversations/data/**` |
| 列表浏览 | 按日期浏览保存内容，支持分页加载 | `src/ui/conversations/**`、`src/viewmodels/conversations/**` |
| 搜索与筛选 | 按内容、来源和站点筛选本地条目 | `src/services/conversations/**`、`src/ui/conversations/**` |
| 多选操作 | 支持批量选择、删除、导出和同步 | `src/ui/conversations/**` |
| 详情阅读 | 展示对话、文章和字幕的 Markdown 详情 | `src/ui/conversations/ConversationDetailPane.tsx`、`src/ui/reader/**` |
| 阅读设置 | 字体、字号、行高、内容宽度、字距和对齐等正文显示设置 | `src/ui/reader/**`、`src/viewmodels/reader/**` |
| Markdown 阅读风格 | Medium、Notion、Book 三种渲染 profile | `src/services/protocols/markdown-reading-profile.ts` |
| 主题 | System、Light、Sepia、Dark、Black | `src/services/protocols/app-theme.ts`、`src/viewmodels/theme/**` |
| 图片补缓存 | 详情菜单可以对当前内容执行 Cache images | `src/ui/reader/**` |
| 字数统计 | 详情更多菜单显示内容字数 | `src/ui/reader/**` |
| Insight 仪表盘 | 显示 clip 数量、来源分布、最长对话等本地统计 | `src/ui/settings/sections/InsightPanel.tsx` |

## 5. 页内交互

| 功能 | 原版行为 | 主要真源 |
| --- | --- | --- |
| Inpage 快捷按钮 | 单击快速保存；双击打开页内评论侧栏 | `src/ui/inpage/**`、`src/services/bootstrap/**` |
| 显示范围设置 | Inpage 按钮可设为全部站点、仅支持站点或关闭 | `src/ui/settings/sections/InpageSection.tsx` |
| 文章评论线程 | 本地保存顶层评论和回复，完整详情和网页侧栏共用数据 | `src/services/comments/**` |
| 附加网页选区 | 把当前文字选区附加为评论引用 | `src/services/comments/sidebar/**` |
| AI 输入框 `$` 插入 | 在支持的 AI 站点输入 `$`，搜索本地条目并插入 Markdown | `src/services/integrations/item-mention/**` |

## 6. Chat with AI

| 功能 | 原版行为 | 主要真源 |
| --- | --- | --- |
| 把本地内容发送到 AI | 从已保存对话或文章生成 prompt，复制并打开目标 AI 平台 | `src/services/integrations/chatwith/**` |
| 自定义模板 | 用户可编辑发送模板和最大字符数 | `src/ui/settings/sections/ChatWithAiSection.tsx` |
| 平台选择 | 用户可控制启用哪些 AI 平台 | `src/services/integrations/chatwith/chatwith-settings.ts` |
| 分组标签页 | 可打开或聚焦一组目标 AI 标签页 | `src/services/integrations/chatwith/tabgroup-runner.ts` |

## 7. 导出、备份与恢复

| 功能 | 原版行为 | 主要真源 |
| --- | --- | --- |
| Markdown 导出 | 单条或批量导出本地内容为 Markdown | `src/services/sync/local/**` |
| Zip 备份 | 导出本地数据库、图片缓存和文章评论线程 | `src/services/sync/backup/export.ts` |
| Zip 恢复 | 从备份恢复会话、消息、图片和评论，并处理重复数据 | `src/services/sync/backup/import.ts` |
| 敏感信息排除 | OAuth token、密钥等不会进入普通备份 | `src/services/sync/backup/**` |

## 8. 外部同步与打开

| 功能 | 原版行为 | 主要真源 |
| --- | --- | --- |
| Notion OAuth | 连接/断开 Notion，选择父页面和各类数据库 | `src/services/sync/notion/**` |
| Notion 增量同步 | 对话、文章、视频按游标增量写入对应数据库 | `src/services/sync/notion/**` |
| Obsidian Local REST | 通过本地 REST API 写入 vault，可配置认证、目录和文件路径 | `src/services/sync/obsidian/**` |
| 飞书 DocX OAuth | 连接飞书并把内容写入云文档目录 | `src/services/sync/feishu/**` |
| 自动同步 | Notion、Obsidian、飞书分别支持后台自动同步开关和调度 | `src/services/sync/auto-sync/**` |
| Open in | 从详情页打开对应的 Notion、Obsidian 或飞书目标 | `src/services/integrations/openin/**` |

## 9. 设置、安全与平台

| 功能 | 原版行为 | 主要真源 |
| --- | --- | --- |
| 设置中心 | AI Chats、Web Articles、Videos、Inpage、Chat with AI、Insight、Backup、Notion、Obsidian、飞书和 About | `src/ui/settings/**` |
| 本地隐私模型 | 原始采集数据保存在浏览器 IndexedDB，只有用户主动配置时才同步外部目标 | `src/services/conversations/**`、`src/services/sync/**` |
| 缓存开关 | AI 对话和网页文章图片缓存分别控制 | `src/ui/settings/sections/AiChatsSection.tsx`、`WebArticlesSection.tsx` |
| 上游浏览器支持 | SyncNos v1.9.1 曾包含 Chrome/Chromium、Edge、Firefox 与 Safari 构建入口；Snap Research 当前只发布 Chrome MV3 | 上游 README；Snap Research `wxt.config.ts` |
| 导航与外部链接保护 | 统一处理扩展页面、外部页面和目标应用打开 | `src/services/integrations/open-external-url.ts`、`src/services/shared/webext.ts` |

## 新功能开发前的使用方式

每次准备添加功能时，必须回答：

1. 本清单是否已经有相同或相邻能力？
2. 当前分支对应模块是否仍存在，接口是否已经变化？
3. 应当复用、扩展，还是确实新增？
4. 是否会替换或破坏原版入口、数据格式、设置或同步链路？
5. 新功能能否沿用已有 collector、IndexedDB、消息协议、详情页、导出或同步能力？

只有代码核对完成后，才进入实现。Snap Research 新增功能记录在
`docs/research-mode/implementation-status.md`，不要反向写进本清单并冒充
上游原版功能。
