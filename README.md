# dsh-plugin-market

DSH 社区插件市场：一个仓库装下市场本体、registry 数据、市场网站与自动采集管线。

## 这是什么

| 目录 | 内容 |
|---|---|
| 仓库根 | **市场插件本体** `dsh-plugin-market`（可安装 bundle 包：`src/host.js` 宿主半片 + `src/client.js` 浏览器半片 + `cordis.patch.yml`） |
| `registry/` | 静态插件数据：`index.json`（curated）、`curated/`（PR 条目）、`auto.json`（自动采集）、`all.json`（合并结果，网站与 DSH 弹窗消费它）、`blocklist.json`、`examples/` |
| `web/` | 市场网站（Vite + React，GitHub Pages 托管）：目录、搜索、详情、上传表单、下载、安装说明 |
| `scripts/` | `collect.mjs` 自动采集器、`validate.mjs` curated 校验 |
| `.github/workflows/` | `collect.yml`（每日采集）、`validate.yml`（PR 校验）、`deploy-pages.yml`（Pages 发布） |
| `docs/` | `REGISTRY.md` 数据模型、`SUBMIT.md` 上架指南 |

## 安装（用户视角）

```bash
dsh plugin --profile web add github:losebird/dsh-plugin-market#v0.1.0
dsh web   # 重启后生效
```

安装后 DSH Web 界面侧栏底部 Settings 旁出现「插件市场」按钮，弹窗里浏览、安装、更新、卸载插件。

- **bundle 条目**：安装即执行 `dsh plugin --profile web add <spec>`，重启生效
- **pack 条目**（skill/preset 扩展包）：下载 release zip → 校验 manifest → 落盘 `~/.agents/skills/` 与 `~/.dsh/.agent-presets/`，绝不覆盖非本市场管理的目录
- 安装状态记录在 `~/.dsh/plugin-market/state.json`
- 每个安装前有 Obsidian 同款信任确认：「社区插件未经官方审核，安装即信任并运行其代码」

## 上传插件

见 `docs/SUBMIT.md`：网站上传页填表 → 生成条目 JSON → 发起 PR 到 `registry/curated/` → 合并即上架。

## 开发

```bash
# 网站本地预览
cd web && npm install && npm run dev

# 手动跑一次采集（需 GITHUB_TOKEN，本地可选）
GITHUB_TOKEN=xxx node scripts/collect.mjs

# 校验 curated 条目
node scripts/validate.mjs
```

## 数据流

```
作者发布 repo/Release ──PR──▶ registry/curated/*.json ──┐
GitHub topic/code search ──每日采集──▶ registry/auto.json ├─▶ registry/all.json ─┬─▶ 市场网站
blocklist ───────────────────────────────┘                                   └─▶ DSH 弹窗
```

## License

MIT
