# 上传（上架）插件指南

向 `registry/curated/` 提一个 PR，合并后数秒内即上架。

`registry/curated/` 目录已存在；每个插件一个文件：`registry/curated/<id>.json`（文件名就是 `<id>.json`）。

## 校验与合并

- `scripts/validate.mjs`（validate workflow）会检查每一个 `registry/curated/*.json`。
- `scripts/collect.mjs`（每日采集）与 `scripts/merge-curated.mjs`（curated 推送时快速 overlay）都会读取 `registry/index.json` **以及** 每一个 `registry/curated/*.json`，合并为 curated 列表（同 id/repo 时 curated 文件覆盖 index），再 overlay 进 `registry/all.json`（curated 覆盖同键 auto）。
- 网站与 DSH 弹窗的「大神手作」会即时读取 GitHub 上的 `registry/index.json` 与 `registry/curated/*.json`（不依赖 all.json 是否已更新；失败则回退 all.json）。`merge-curated` 工作流（push `registry/curated/` 或 `registry/index.json`）会在数秒内 overlay 进 `all.json`；每日 `collect` 仍会全量采集 GitHub，curated 条目继续覆盖同键 auto。

## 路径一：DSH 插件（bundle，推荐）

你的插件 = 一个声明了 `dsh.bundle.patch` 的 npm/git 包（宿主行 + 浏览器行）。参考本仓库根目录的 `dsh-plugin-market` 自身。

1. 把你自己的插件仓库推到 GitHub，并发布一个 Release（tag 即版本号）。
2. 打开市场网站的上传页，填表 → 生成条目 JSON。
3. 点击「发起 PR」：文件路径 `registry/curated/<你的id>.json`。
4. PR 合并后数秒内上架；用户可在 DSH 弹窗里一键安装（0.1.57 起：`spec` 为已发布的 npm 包名，或 Release 资产的 `https://…tgz`）。

> git 托管的插件安装后会跑 prepare 脚本、被 pnpm 拦截。**请把构建产物（lib/ 等）直接提交进仓库**，不要依赖安装时构建，否则用户安装会失败。
>
> `github:` / `git+` 形式的 `spec` 仍可通过 validate（用于列表展示），但一键安装请用 npm 包名或 `https://…tgz`。不要把第三方包重新发布到 `@ace-zone`。

## 路径二：扩展包（pack：skill / preset 目录合集）

1. 按 `docs/REGISTRY.md` 的布局组织目录，打成 zip。
2. 在**你自己的仓库**发一个 GitHub Release，把 zip 作为资产上传。
3. 上传页填表，`spec` 填该资产的下载 URL（`https://github.com/<owner>/<repo>/releases/download/<tag>/<file>.zip`）。
4. PR `registry/curated/<你的id>.json`，合并后数秒内上架。

## 字段速查

| 字段 | 必填 | 说明 |
|---|---|---|
| id | ✅ | `^[a-z0-9][a-z0-9._-]*$`，全局唯一 |
| name | ✅ | 显示名 |
| type | ✅ | `bundle` 或 `pack` |
| repo | ✅ | `owner/name` |
| spec | ✅ | bundle: 已发布 npm 包名 **或** `https://…tgz`（Release 资产）；pack: `https://…zip` |
| description | ✅ | 一句话简介 |
| longDescription | ⬜ | markdown 详情（网站详情区） |
| tags | ⬜ | 最多 8 个，避免生态噪声词（dsh、deepseek、claude-code 等会被过滤） |
| category | ⬜ | 功能分类白名单：ui / session / agent / tools / dev / comm / auth / skills / market / fun / other（不填自动判定） |
| license | ✅ | SPDX id |
| author.name | ✅ | 作者名 |
| author.url | ⬜ | `https://` 开头 |

## 黑名单 / 下架

维护者在 `registry/blocklist.json` 里加一行（repo 全名或 npm 包名，小写）。collector 会跳过、validate 会拒绝同名单条目。也可以直接 PR 删除 `registry/curated/<id>.json`。
