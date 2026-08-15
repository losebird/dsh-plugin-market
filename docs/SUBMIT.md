# 上传（上架）插件指南

两种类型，两条路径，最终都是往 `registry/curated/` 提一个 PR，合并即上架。

## 路径一：DSH 插件（bundle，推荐）

你的插件 = 一个声明了 `dsh.bundle.patch` 的 npm/git 包（宿主行 + 浏览器行）。参考本仓库根目录的 `dsh-plugin-market` 自身。

1. 把你自己的插件仓库推到 GitHub，并发布一个 Release（tag 即版本号）。
2. 打开市场网站的上传页，填表 → 生成条目 JSON。
3. 点击「发起 PR」：文件路径 `registry/curated/<你的id>.json`。
4. 合并后，用户即可在 DSH 弹窗里点安装（等价于 `dsh plugin --profile web add github:<你>/<仓库>#<tag>`）。

> git 托管的插件安装后会跑 prepare 脚本、被 pnpm 拦截。**请把构建产物（lib/ 等）直接提交进仓库**，不要依赖安装时构建，否则用户安装会失败。

## 路径二：扩展包（pack：skill / preset 目录合集）

1. 按 `docs/REGISTRY.md` 的布局组织目录，打成 zip。
2. 在**你自己的仓库**发一个 GitHub Release，把 zip 作为资产上传。
3. 上传页填表，`spec` 填该资产的下载 URL（`https://github.com/<owner>/<repo>/releases/download/<tag>/<file>.zip`）。
4. PR `registry/curated/<你的id>.json`，合并即上架。

## 字段速查

| 字段 | 必填 | 说明 |
|---|---|---|
| id | ✅ | `^[a-z0-9][a-z0-9._-]*$`，全局唯一 |
| name | ✅ | 显示名 |
| type | ✅ | `bundle` 或 `pack` |
| repo | ✅ | `owner/name` |
| spec | ✅ | bundle: `github:owner/repo#tag`；pack: `https://…zip` |
| description | ✅ | 一句话简介 |
| longDescription | ⬜ | markdown 详情（网站详情区） |
| tags | ⬜ | 最多 8 个 |
| license | ✅ | SPDX id |
| author.name | ✅ | 作者名 |
| author.url | ⬜ | `https://` 开头 |

## 黑名单 / 下架

维护者在 `registry/blocklist.json` 里加一行（repo 全名或 npm 包名，小写）。collector 会跳过、validate 会拒绝同名单条目。也可以直接 PR 删除 `registry/curated/<id>.json`。
