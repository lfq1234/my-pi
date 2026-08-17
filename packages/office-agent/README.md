# office-agent（@earendil-works/pi-office-agent）

基于共享 pi 引擎的**办公智能体**：自然语言 → Word/Excel/PPT/海报/HTML，并提供
TUI / 一次性 CLI / RPC server 三种入口。镜像 coding-agent 的架构，`pi-*` 引擎零改动。

## 能力面

| 方向 | 工具 | 产出 |
|---|---|---|
| WPS 三件套 | `wps_writer` / `wps_sheet` / `wps_slide` / `wps_macro` | docx / xlsx / pptx + JSA 宏精修 |
| 海报 | `poster_generate`（即梦出图）/ `poster_compose`（出字）/ `poster_template`（内置模板） | png / pdf（中文可靠） |
| HTML | `html_generate` / `html_preview`（Edge 截图校验）/ `html_deploy`（静态托管） | 单文件 HTML / 截图 / 部署 |

另含：办公领域系统提示（三大方向 + 结构化入参引导）、海报模板库（4 套 JSON）、
WPS 对象模型速查、长文档压缩（compaction）、环境自检自动装依赖（`office doctor`）、
扩展系统（`extensions`）、客户端封装（`client`）、独立启动器（`server`）。

## 环境要求

- **Node.js ≥ 22**（本仓库使用 WorkBuddy 受管 Node 22.22.2；该路径未加入系统 PATH 时，
  在 PowerShell 里 `$env:PATH = "C:\Users\LENOVO\.workbuddy\binaries\node\versions\22.22.2;$env:PATH"`）
- **LibreOffice**：docx/pptx → pdf、xlsx → csv/png 转换依赖。**缺失时自动安装**
  （`office doctor` 或 `convert()` 触发，Windows 走 winget）
- **浏览器**：html_preview 截图用本机 Edge/Chrome（playwright-core，无需下载 chromium）；
  无浏览器时自动降级为静态校验
- **中文字体**：Windows 自带（simhei/msyh），Linux 需 Noto/WQY

## 快速开始

```bash
# 1. 安装依赖 + 构建（仓库根目录或本包目录均可）
npm install
npm run build            # tsgo -p tsconfig.build.json

# 2. 环境自检（缺失依赖自动安装）
node dist/cli.js doctor

# 3. 三种入口
node dist/cli.js --mode print --prompt "写季度总结"        # 端到端生成 docx 后退出
node dist/cli.js --mode interactive                         # 进入 TUI 对话（Escape 退出）
node dist/cli.js --mode rpc --port 4317                     # 起 RPC server 供 GUI/客户端连接
```

> 无 LLM 环境下 print/interactive/rpc 默认用**演示流**（fake streamFn）驱动——它会真实
> 调用 `wps_writer` 生成 `demo-quarterly.docx`（`OFFICE_DEMO_OUT` 可指定路径），跑通全链路。
> 接入真实模型用编程式 `createOfficeAgentSession({ model })`（见下）。

## CLI 参考

```
office - 办公智能体 CLI

用法:
  office --mode <interactive|print|rpc> [选项]
  office --prompt "<问题>"          # 等价于 --mode print
  office                            # 默认 interactive
  office doctor                     # 环境自检，缺失依赖自动安装

选项:
  --mode <mode>      运行模式：interactive / print / rpc
  -p, --prompt <str> print 模式的一次性提示词
  --cwd <dir>        会话工作目录（默认当前目录）
  --host <host>      rpc 监听地址（默认 127.0.0.1）
  --port <port>      rpc 监听端口（默认 4317）
  -h, --help         显示帮助
  -v, --version      显示版本
```

## 编程式使用（SDK / client / server / extensions）

```typescript
// SDK：默认装配（officeTools + 办公提示 + 可注入扩展）
const { session } = await createOfficeAgentSession({
  cwd: "/path/to/out",
  extensions: [myExtension],            // 可选：扩展系统
  model: myModel,                        // 可选：真实 LLM（缺省演示流）
});
await session.prompt("写季度总结");
console.log(session.messages.at(-1));

// client：连 rpc server（对外子路径 @earendil-works/pi-office-agent/client）
import { openOfficeSession } from "@earendil-works/pi-office-agent/client";
const s = await openOfficeSession({ host: "127.0.0.1", port: 4317, cwd: "/tmp" });
await s.submit("写季度总结 docx");

// server：一行起 pi-protocol server
import { startOfficeServer } from "@earendil-works/pi-office-agent";
const { address, close } = await startOfficeServer({ port: 4317, cwd: "/tmp" });
await close();

// extensions：不改 core 代码追加自定义工具
import type { OfficeExtensionFactory } from "@earendil-works/pi-office-agent";
const myExtension: OfficeExtensionFactory = (pi) => {
  pi.registerTool({ /* OfficeToolDefinition */ });
  pi.registerPromptSnippet("我的能力", "- 描述");
};
```

详细设计见 `doc/modules/{extensions,client,server}.md`。

## 验收与开发

构建后运行验收脚本（`scripts/`）：

```bash
node scripts/acceptance.mjs            # phase-1 交付（docx/xlsx/pptx/海报/convert）
node scripts/acceptance-phase2.mjs     # phase-2 五个主干工具
node scripts/acceptance-phase3.mjs     # phase-3 GUI 链路（RemoteSession）
node scripts/acceptance-phase4.mjs     # phase-4 三模式入口
node scripts/acceptance-phase5.mjs     # phase-5 增强工具
node scripts/acceptance-phase6.mjs     # phase-6 提示与模板
node scripts/acceptance-env.mjs        # 环境自检与自动安装
node scripts/acceptance-modules.mjs    # extensions/client/server 三模块
```

产物输出到 `examples/out-phase*/`（已 gitignore）。代码质量：`npx biome check src`；
类型检查：根目录 `npx tsgo --noEmit`（office-agent 相关应干净）。

## 模块结构

```
src/
├── cli.ts / main.ts        # 入口：参数解析、doctor、三模式分发（cli 非重点，可裁剪）
├── core/                   # SDK：sdk.ts、agent-session、tools/（10 工具）、delivery/、
│                           #   prompt（办公提示+速查）、compaction、env-check、resource-loader
├── extensions/             # 扩展系统：OfficeExtensionFactory / runner / 目录加载
├── client/                 # 客户端封装：openOfficeSession / createOfficePiClient
├── server/                 # 独立启动器：startOfficeServer（TCP/unix）
├── gui/                    # GUI 逻辑层：backend、demo-server、preview、render、extractArtifacts
└── modes/                  # 三种模式：interactive（pi-tui）/ print / rpc + tcp transport
```

## 里程碑

phase-0（骨架复用）→ phase-1（delivery 生成/转换）→ phase-2（5 主干工具）→
phase-3（GUI 链路）→ phase-4（三模式入口）→ phase-5（增强工具）→
phase-6（提示与模板）→ 三模块（extensions/client/server）。每阶段增量叠加、
接口稳定、`pi-*` 引擎零改动。需求文档见 `doc/requirements/`，模块设计见 `doc/modules/`。
