# 本地小说阅读器（浏览器版）

一款纯本地运行的 TXT 小说阅读器：**打开 TXT → 自动识别编码 → 自动识别章节 → 以起点中文网风格的阅读页直接阅读 → 关闭后自动记住位置**。

## 产品形态（重要）

这不是桌面应用，而是运行在**谷歌浏览器**里的网页阅读器：

- 通过“打开 TXT”、拖拽文件或文件选择器载入本地 TXT 小说；
- 文件内容全程在本机浏览器内解析与渲染，**不上传、不联网、无后端**；
- 阅读页对齐起点中文网的网页模式：居中正文、首行缩进两字符、上一章/下一章底部导航、目录侧栏、字号/字体/行距/背景主题即时调整。

## 运行方式

```bash
npm install
npm run dev        # 开发模式，Chrome 打开 http://localhost:5173
```

构建为单个 HTML 文件（可直接用 Chrome 打开，无需服务器）：

```bash
npm run build      # 产物：dist/index.html
```

> 建议：日常使用推荐通过 `npm run dev` 或任意静态服务器访问（功能最完整，尤其是“重新打开上次阅读位置”）。直接双击 `dist/index.html` 也可使用基础功能。

## 浏览器支持

- 目标浏览器：Google Chrome（桌面版）。
- 编码识别、章节解析、书库、进度保存等核心功能在所有现代浏览器可用；
- “无需重新选择文件即可续读上次位置”依赖 Chrome 的 File System Access API；其他浏览器会自动回退为重新选择文件。

## 数据存储在哪里

程序本身是纯静态网页，但书库、阅读进度、设置保存在浏览器里，位置如下（Chrome，Windows）：

- IndexedDB（书库 `books`、进度 `progress`、文件句柄 `handles`）：
  `C:\Users\<用户名>\AppData\Local\Google\Chrome\User Data\Default\IndexedDB\`
  - 通过开发服务器使用时为 `http_localhost_5173.indexeddb.leveldb`
  - 直接双击打开 `dist/index.html` 时为 `file__...indexeddb.leveldb`
- 阅读设置（localStorage，键 `txt-reader-settings`）：
  `C:\Users\<用户名>\AppData\Local\Google\Chrome\User Data\Default\Local Storage\leveldb\`

这些是浏览器的内部数据库文件（LevelDB 格式），不要直接编辑；在 Chrome 里按 F12 → Application 面板可以直观查看、修改或删除。数据在浏览器重启后仍然保留；但清除站点数据、使用无痕窗口、换浏览器或换 Chrome 配置都会看不到这些数据。

## 迁移到其他电脑

- **只想阅读**：把构建产物 `dist/index.html`（单个文件）复制到新电脑（U 盘、网盘、微信发送均可），用 Chrome 打开就能用，不需要安装任何环境。
- **需要改代码/自己部署**：复制整个项目目录（可排除 `node_modules/`、`dist/`、`.tmp/`），在新电脑安装 Node.js 后执行 `npm install && npm run dev`（或 `npm run build` 重新生成单文件）。
- **注意**：书库、阅读进度、主题设置保存在浏览器本地（IndexedDB / localStorage），绑定的是那台电脑上的 Chrome 浏览器，不会随文件一起迁移。到新电脑后需要重新导入 TXT 小说；阅读进度从新环境重新记录。如需随身携带进度，后续可增加“导出 / 导入书库”功能。

## 已实现功能（第一阶段 P0 主体）

- TXT 编码自动识别：UTF-8（含 BOM）、UTF-16 LE/BE、GB18030/GBK、Big5、Windows ANSI；可手动选择编码并即时重新解析；
- 大文件分块扫描章节（不整本读入内存），生成“章节名 + 字节偏移”索引，点击目录任意跳转；
- 起点风格阅读页：居中单栏正文、首行缩进、章节标题、上一章/下一章；
- 连续滚动阅读：读到章节末尾自动加载下一章，无需手动点击；
- 起点式侧边工具：目录 / 设置 / 主题置于正文旁，主题色板即点即换；
- 上一章 / 下一章按钮居中于正文下方，靠近文字方便点击；
- 阅读设置即时生效：字体、字号、行距、段距、对齐方式（左/两端）、正文最大宽度；
- 主题系统：日间 / 米黄 / 护眼绿 / 夜间，阅读页内一键切换、即时生效、自动保存；
- 本地书库（IndexedDB）：最近阅读、全部书籍、收藏；
- 阅读进度自动保存：当前章节 + 滚动位置，关闭后重新打开自动恢复；
- 快捷键：`Esc` 隐藏/显示控制栏、`←/→` 切换章节、`PageUp/PageDown` 翻页、`Home/End` 到章首尾、`Ctrl + +/-` 调整字号、`t` 目录、`s` 设置；
- 拖拽 TXT 打开、文件选择器打开。

## 技术栈与架构

- Vite + React 19 + TypeScript；
- `TextDecoder`（Encoding Standard）解码 GBK/Big5/UTF-16 等编码；
- 自研轻量编码启发式检测（BOM → UTF-16 空字节模式 → 严格 UTF-8 校验 → GB18030/Big5 打分）；
- 分块章节扫描：按 4MB 分块 + 行尾携带（carry）方式扫描，输出章节字节偏移索引；
- IndexedDB 本地存储：`books`（书库）、`progress`（进度）、`handles`（文件句柄）；
- File System Access API（Chrome）：保存文件句柄，重启后申请权限即可续读原文件。

## 目录结构

```text
src/
  App.tsx                 # 视图切换（书架/阅读）、文件导入流程、全局状态
  types.ts                # 领域类型
  lib/
    encoding.ts           # 编码检测与解码
    chapters.ts           # 章节规则与分块扫描
    storage.ts            # IndexedDB 封装
    fileOpen.ts           # 文件选择 / File System Access / 句柄持久化
    settings.ts           # 阅读设置默认值与持久化
  components/
    Bookshelf.tsx         # 书架页（最近阅读/全部/收藏）
    Reader.tsx            # 起点风格阅读页
    ChapterSidebar.tsx    # 目录侧栏
    SettingsDrawer.tsx    # 阅读设置面板
  styles.css              # 主题变量与布局
```

## 开发路线（与需求文档对应）

- P0 已完成主体：打开 TXT、编码识别、显示文本、阅读器 UI、字体/字号/行距/宽度、日间/夜间、进度自动保存、章节识别、章节目录、大文件性能；
- P1（下一阶段）：更完善的本地书架交互（封面占位、排序筛选）、收藏置顶、窗口/页面状态记忆、阅读统计；
- Future：硬换行合并、划线笔记、TTS 朗读、EPUB 支持（均按需求文档暂不实现）。

## License

MIT
