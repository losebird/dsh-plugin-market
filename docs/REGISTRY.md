# Registry 数据模型

DSH 插件市场的数据全部是仓库里的静态 JSON，无后端。三个文件 + 一个目录：

| 文件 | 谁写 | 含义 |
|---|---|---|
| `registry/index.json` | 维护者 / PR | **curated 主列表**（人工上架） |
| `registry/curated/<id>.json` | 插件作者 PR | 每个 curated 条目的源文件（validate workflow 校验） |
| `registry/auto.json` | collect 工作流 | 自动采集的原始产出 |
| `registry/all.json` | collect 工作流 | **合并结果**（curated ∪ auto，curated 覆盖 auto，按 stars 排序）——网站与 DSH 弹窗消费的就是它 |
| `registry/blocklist.json` | 维护者 | 黑名单（repo 全名或 npm 包名，小写），collector 跳过、validate 拒绝 |

## 条目 schema

```jsonc
{
  "id": "demo-hello",              // ^[a-z0-9][a-z0-9._-]*$，唯一
  "name": "Demo Hello Skill",
  "type": "bundle",                // bundle = DSH 插件包（dsh plugin add）；pack = skill/preset 扩展包（zip）
  "package": "@ace-zone/dsh-market", // bundle 的 npm 包名（自动采集会填；卸载时用）
  "repo": "losebird/dsh-plugin-market", // owner/name，必填
  "spec": "@ace-zone/dsh-market",
  // bundle 一键安装：npm 包名（无版本 pin）或 https://…tgz  release 资产
  // bundle 仅展示：github:<owner>/<repo>[#tag]（不可一键安装）
  // pack:   https:// 开头的 zip 下载地址（通常是 release 资产）
  "version": "v0.1.0",
  "author": { "name": "losebird", "url": "https://github.com/losebird" },
  "description": "一句话简介（卡片显示）",
  "longDescription": "完整介绍，支持 markdown（网站详情页显示，可选）",
  "tags": ["market", "ui"],
  "category": "market",            // 功能分类，见下方白名单；curated 可显式声明，否则由分类器自动判定
  "license": "MIT",
  "downloads": 123,   // 由 collector 汇总 release 资产下载数（自动条目）；curated 也可静态维护
  "stars": 456,       // 由 collector 填（自动条目）
  "source": "auto",   // auto | curated
  "auto": true,       // 自动收录徽章
  "verified": true,   // 可安装判据：package.json 声明了 dsh.bundle.patch（与 dsh plugin add 一致）
  // 未验证（false）的条目仍会展示，但禁用一键安装；curated 条目默认为 true
  "status": "unavailable", // 可选：仓库已删/私有，禁用安装按钮但保留条目
  "contents": { "skills": ["demo-hello"], "presets": [] }, // pack 条目声明 zip 内的目录
  "install": {                        // 安装方式（collector 从 README 识别，curated 可显式覆盖）
    "method": "script",               // script | dsh-plugin-add | npm-global | git-clone | desktop | manual | pack
    "source": "readme",               // readme（项目 README 写明）| pkg（包特征启发式）| curated | npm
    "os": {                           // method=script 时按系统分命令；详情页展示用，非一键安装路径
      "darwin": "curl -fsSL https://raw.githubusercontent.com/o/r/main/scripts/install.sh | bash",
      "linux": "curl -fsSL https://raw.githubusercontent.com/o/r/main/scripts/install.sh | bash",
      "win32": "irm https://raw.githubusercontent.com/o/r/main/scripts/install.ps1 | iex"
    },
    "scriptUrl": "https://raw.githubusercontent.com/o/r/main/scripts/install.sh",
    "command": "npm install -g x"     // npm-global / git-clone 的展示命令
  }
}
```

## 一键安装与安全模型

**可一键安装**（`canOneClick`）仅当：

- **bundle**：`verified !== false` 且 `spec` 为 npm 包名或 `https://…tgz` URL（或 `package` 字段为 npm 包名作为兜底）
- **pack**：`spec` 为 `https://` 开头的 zip URL

`github:` / `git+https` spec 仅用于列表展示与详情链接，**不会**作为 DSH 弹窗的一键安装目标。

**Install API 为 id-only**：客户端只传条目 `id`；宿主从 registry 查条目，自行解析 `spec` 并执行 `dsh plugin add`。客户端不能注入 spec 或 shell 命令。

市场**不会**代作者把插件 republish 到 `@ace-zone`；一键安装使用作者自己的 npm 包名或 release `.tgz` 资产。

不支持 `dangerouslyAllowAllBuilds`、不支持 agent-install（把 INSTALL.md 交给 AI 执行）。

`install.method` 仍可从 README 识别并记录（script / git-clone / manual 等），用于详情页展示；**一键安装按钮只执行** npm / tgz / pack 三条路径。

`git-clone`、脚本安装、npm-global 等 README 方式**不会**在 DSH 弹窗里全自动执行；用户需按 README 或详情页说明自行安装。

## collector 的 spec 选择（`scripts/collect.mjs`）

自动条目在已知 `pkg`、`latest`、`verified`、`install` 后，按顺序选择 `spec`：

1. 复用上一轮且已有 npm 名或 tgz URL → 保留 `prev.spec`
2. 否则若 `pkg.name` 已在 npm 发布（HEAD `registry.npmjs.org`，8s 超时）→ `spec = pkg.name`（裸名，不 pin 版本）
3. 否则若最新 release 有 `https://…tgz` 资产 → 使用该 URL
4. 否则回退 `github:owner/repo#tag` 或 `github:owner/repo`（**不可一键安装**）

若最终 spec 为 npm/tgz 且 `verified` 且 `install.method` 不是 `desktop` / `pack`，collector 将 `install` 设为 `{ method: 'dsh-plugin-add', source: 'npm' }`（覆盖 README 里的 script/git-clone/manual/npm-global，保证一键走 npm）。

`install.method` 判定规则（README 识别，与 spec 独立记录）：

1. 只在 README 的「安装类」章节内识别（install/安装/快速开始/Quick Start 等；`Target installation experience`、Roadmap 等未来/规划标题跳过）。识别顺序：脚本安装（`curl|bash` / `irm|iex`，按 OS 记录）> `dsh plugin add` > `npm -g` > `git clone`。
2. `dsh plugin add` 仅当 README 给出**可远程安装**的 spec（`github:` / `git+https` / `https` / npm 包名）才采用；本地 tarball（`/path/x.tgz`、`file:`、相对路径）说明项目要求自行构建后本地安装，一律拒绝。
3. **verified（声明了 `dsh.bundle.patch`）不再默认 dsh-plugin-add**——不是所有 bundle 都能直接 `dsh plugin add` 装上。
4. README 未写明可自动识别方式 → `manual`（按仓库说明安装，市场展示 README）；README 拉取失败才沿用上一轮结论。包特征启发式仅保留 `bin` → npm-global、electron → desktop。

## pack（扩展包）zip 布局

```
manifest.json          # { id, name, version, description, author, license, skills: [], presets: [] }
skills/<id>/SKILL.md   # 一个 skill 一个目录（可选）
presets/<id>/agent.cordis.yml   # 一个 preset 一个目录（可选）
```

安装时：`skills/<id>/` → `~/.agents/skills/<id>/`，`presets/<id>/` → `~/.dsh/.agent-presets/<id>/`。

**首次安装冲突**：仅当目标目录已存在且**不是**市场托管记录（`~/.dsh/plugin-market/state.json` 中无该 id）时才报冲突；市场已安装过的 pack 可覆盖更新。

## 功能分类

每个条目带 `category` 字段，白名单：

| key | 含义 | key | 含义 |
|---|---|---|---|
| `ui` | 界面与主题 | `comm` | 通信与移动 |
| `session` | 会话与记忆 | `auth` | 安全与权限 |
| `agent` | Agent 与工作流 | `skills` | 技能与扩展 |
| `tools` | 工具与集成 | `market` | 市场与发现 |
| `dev` | 开发与输入 | `fun` | 趣味与个性 |
| `other` | 其他 | | |

curated 条目可显式声明 `category`；未声明的由采集器按名称/简介/标签关键词自动判定。展示用的 `tags` 会过滤掉 dsh-plugin、deepseek、claude-code 等生态噪声词。

## 去重与合并规则

- 去重键 = npm 包名（`pkg:<name>`）或规范化 repo URL（`repo:github.com/owner/repo`，去 `.git`、小写）。
- curated 条目覆盖同键的 auto 条目（`all.json` 只保留 curated 版本）。
- fork 一律排除（搜索 `fork:false`）。
- 上轮存在、本轮未重新发现的自动条目：查一次 repo 状态——404/私有 → 标记 `status: unavailable`（保留、禁用安装）；仍存活 → 保留旧数据。
- 下架 = 维护者在 `blocklist.json` 加一行。
