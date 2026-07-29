# 依赖关系

## 构建与运行时矩阵

| 产品线 / 层 | 语言 | 核心运行时 / 框架 | 构建入口 | 运行目标 |
| --- | --- | --- | --- | --- |
| WebClipper | TypeScript 5.9 | WXT、MV3、React 19、React Router 7、Vitest | `package.json`, `wxt.config.ts` | Chrome/Chromium；同一运行时覆盖 chat/article/video transcript 采集 |
| 交付层 | YAML + Node 22 | GitHub Actions、构建与审计脚本 | `.github/workflows/webclipper-ci.yml`, `.github/scripts/webclipper/*.mjs` | Chrome MV3 / GitHub Release |

## WebClipper 主要依赖

| 依赖 | 类型 | 版本 | 用途 |
| --- | --- | --- | --- |
| `react`, `react-dom` | runtime | `^19.2.4` | popup / app UI 渲染 |
| `react-router-dom` | runtime | `7.13.1` | 扩展内部 app 路由 |
| `recharts` | runtime | `^3.8.0` | Settings Insight 的来源分布 / 域名分布图表 |
| `markdown-it` | runtime | `^14.1.0` | Markdown 消息渲染 |
| `lucide-react` | runtime | `^0.541.0` | UI 图标 |
| `wxt` | dev | `^0.20.18` | MV3 开发与构建 |
| `@wxt-dev/module-react` | dev | `^1.1.5` | WXT React 模块 |
| `typescript` | dev | `^5.9.3` | 类型检查与编译约束 |
| `vitest` | dev | `^2.1.8` | 单元测试 |
| `fake-indexeddb`, `jsdom` | dev | `^6.2.2`, `^28.1.0` | 存储与 DOM 测试环境 |
| `tailwindcss`, `postcss`, `autoprefixer` | dev | `^3.4.17`, `^8.5.6`, `^10.4.21` | 扩展 UI 样式链 |

- 视频字幕采集不引入独立第三方依赖；它继续复用现有 DOM、content script、message contract 与 WXT 运行时。

## 外部服务与平台

| 服务 / 平台 | 调用方 | 方式 | 作用 |
| --- | --- | --- | --- |
| Notion OAuth authorize + Notion API | App + WebClipper | HTTPS | Parent Page、数据库、页面属性、blocks 写入 |
| Notion OAuth Worker（`syncnos-notion-oauth`） | WebClipper | HTTPS `POST /notion/oauth/exchange` | 在 Worker 端持有 `client_secret` 完成 code exchange，避免扩展侧暴露密钥 |
| Obsidian Local REST API | WebClipper | 本地 HTTP（默认 `http://127.0.0.1:27123`） | 把会话或文章写入 vault |
| Feishu OAuth + DocX API | WebClipper | HTTPS | OAuth 授权、Convert API（markdown → DocX blocks）、Drive 文件夹管理、图片上传与绑定 |
| Feishu OAuth Worker（`syncnos-feishu-oauth`） | WebClipper | HTTPS `POST /exchange`, `POST /refresh` | 在 Worker 端持有 `client_secret` 完成 code exchange / token refresh，避免扩展侧暴露密钥 |
| 浏览器 DOM | WebClipper | content script | 采集 AI 对话、网页正文与视频字幕 |
| GitHub Release | CI + 本地发布流程 | GitHub Actions / GitHub Releases | 验证并发布经过审计的 Chrome MV3 产物 |

## 工具链与验证入口

| 工具 / 命令 | 位置 | 用途 | 备注 |
| --- | --- | --- | --- |
| `npm run compile` | `package.json` | TypeScript 类型检查 | 默认验证顺序第一步 |
| `npm run test` | `package.json` | Vitest 单元测试 | 游标、迁移、Markdown、存储逻辑 |
| `npm run build` | `package.json` | 生成 Chrome MV3 构建产物 | `check` 之前的基础步骤 |
| `npm run check` | `package.json` | build 后跑 `check-dist.mjs` | 验证 dist 完整性与关键引用 |

## 版本与兼容性规则

| 项 | 当前值 | 来源 | 为什么重要 |
| --- | --- | --- | --- |
| WebClipper `package.json` 版本 | `0.3.4` | `package.json` | 与 manifest 和 GitHub Release 版本一致 |
| WebClipper manifest 版本 | `0.3.4` | `wxt.config.ts` | 决定安装包显示版本 |
| Manifest 模式 | `3` | `wxt.config.ts` | 决定扩展是 MV3 架构 |
| CI Node 版本 | `22` | `webclipper-ci.yml` | 与仓库声明的 Node 版本保持一致 |

- **版本规则**：`verify-release-version.mjs` 强制校验 `package.json` 与 `wxt.config.ts` 的版本一致。
- **OAuth 交换边界**：扩展回调后会把 `code` 发给 `https://syncnos-notion-oauth.chiimagnus.workers.dev/notion/oauth/exchange`；Worker 再向 Notion token endpoint 交换 `access_token`。Feishu 同理，通过 `syncnos-feishu-oauth` Worker 完成 code exchange 和 token refresh。
- **权限边界**：扩展 manifest 使用 `storage`, `contextMenus`, `tabs`, `webNavigation`, `activeTab`, `scripting`，并配合广泛 `host_permissions` 覆盖支持站点与普通网页；UI 是否真正启动仍受运行时 gating 控制。

## 修改依赖时最应该注意什么

| 改动类型 | 先看哪里 | 需要同步什么 |
| --- | --- | --- |
| 扩展新增依赖 / 构建插件 | `package.json`, `wxt.config.ts`, workflow | 构建、本地验证、CI 环境 |
| 发布版本调整 | `package.json`, `package-lock.json`, `wxt.config.ts` | 包版本、manifest 与 GitHub Release 标签 |
| 新增权限或 host 权限 | `wxt.config.ts`, `src/services/bootstrap/content.ts` | manifest、运行时 gating、文档 |
