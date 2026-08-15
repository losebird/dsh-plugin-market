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
  "package": "dsh-plugin-market",  // bundle 的 npm 包名（自动采集会填；卸载时用）
  "repo": "losebird/dsh-plugin-market", // owner/name，必填
  "spec": "github:losebird/dsh-plugin-market#v0.1.0",
  // bundle: github:<owner>/<repo>[#tag] | git+https://...#tag | npm 包名
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
  "contents": { "skills": ["demo-hello"], "presets": [] } // pack 条目声明 zip 内的目录
}
```

## pack（扩展包）zip 布局

```
manifest.json          # { id, name, version, description, author, license, skills: [], presets: [] }
skills/<id>/SKILL.md   # 一个 skill 一个目录（可选）
presets/<id>/agent.cordis.yml   # 一个 preset 一个目录（可选）
```

安装时：`skills/<id>/` → `~/.agents/skills/<id>/`，`presets/<id>/` → `~/.dsh/.agent-presets/<id>/`。

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
