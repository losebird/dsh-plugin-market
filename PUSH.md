# Push 清单：把插件市场推上 GitHub

本地产线已全部就绪，你只需要按下面步骤在 GitHub 上建仓库并推送。

## 1. 建仓库

在 github.com 新建公开仓库 **`losebird/dsh-plugin-market`**（不要勾选初始化 README/gitignore/license）。

## 2. 本地初始化并推送

```bash
cd /Users/zxz/Documents/ai-project/dsh
git init
git add .
git commit -m "feat: DSH 插件市场 v0.1.0（市场插件 + registry + 网站 + 采集管线）"
git remote add origin git@github.com:losebird/dsh-plugin-market.git
git push -u origin main
```

（`web/node_modules`、`web/dist`、`.npm-cache` 已被 `.gitignore` 排除。）

## 3. 启用 GitHub Pages

仓库 Settings → Pages → Source 选 **GitHub Actions**。
`deploy-pages.yml` 会在 push 时自动构建并发布到
`https://losebird.github.io/dsh-plugin-market/`（首次构建约 1 分钟）。

## 4. 跑一次采集（生成 auto.json）

Actions 页 → `collect` 工作流 → **Run workflow**。
跑完后仓库里出现 `registry/auto.json` 和更新后的 `registry/all.json`。
之后每天 UTC 02:17 自动跑。

## 5. 打发布 tag（让 bundle 安装可固定版本）

```bash
git tag v0.1.0
git push origin v0.1.0
```

## 6. 验收清单

- [ ] 打开 `https://losebird.github.io/dsh-plugin-market/`：目录、上传页、安装说明正常
- [ ] 上传页填一个测试条目，「发起 PR」能带到 GitHub 新建文件页
- [ ] DSH 弹窗刷新后显示「registry 实时」（读 raw.githubusercontent 的 all.json）
- [ ] 弹窗里安装「Demo Hello Skill」演示包，`~/.agents/skills/demo-hello/` 出现 SKILL.md
- [ ] 弹窗里安装「DSH 插件市场」自举条目：等价于
      `dsh plugin --profile web add github:losebird/dsh-plugin-market#main`，重启后按钮常驻
- [ ] 卸载再装一次，确认 state.json 记录与「拒绝覆盖非市场目录」逻辑

## 7. 可选后续

- 发布 npm：`npm publish`（把 `dsh plugin add dsh-plugin-market` 变成最简装法）
- 插件作者想在非 GitHub 环境安装：网站下载 zip → 弹窗「从本地导入」或手动按目录规范放置
- 下架插件：往 `registry/blocklist.json` 加一行（repo 全名或 npm 包名）

## 已知注意点

- git 托管插件的 prepare 脚本会被 pnpm 拦截：本仓库是无构建纯 ESM，`src/` 直接提交，规避了这一点；对外发布指南里也要求作者提交构建产物
- bundle 条目安装后需**重启 dsh** 生效（与 Obsidian 一致）
- `~/.dsh/profiles/web` 是 `dsh plugin add` 的实际落点，卸载依赖 `dsh plugin remove`
