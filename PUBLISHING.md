# 发布到 GitHub

这份仓库已经包含开源所需的基本文件：

- `README.md`：功能、数据来源、安装和限制
- `LICENSE`：MIT
- `CONTRIBUTING.md`：开发、测试和提交规范
- `CHANGELOG.md`：版本记录
- `icon.svg`：为本插件原创绘制的 Token 脉冲图标（MIT）
- `.gitignore`：排除本地测试目录、依赖和构建包
- `.github/workflows/ci.yml`：GitHub Actions 语法检查和测试

## 1. 安装 Git

Windows 可以用 winget：

```powershell
winget install --id Git.Git -e --source winget
```

安装后重新打开终端，确认：

```powershell
git --version
```

首次使用需要配置提交身份：

```powershell
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

## 2. 在本地初始化仓库

在项目目录执行：

```powershell
cd <你的仓库目录>
git init -b main
git add .
git commit -m "feat: live token and balance HUD for DSH"
```

提交前确认没有把以下内容加入 Git：

- `.scratch/`、`.testhome/`、`.chrome-test*/`
- `artifacts/` 里的本地 tgz
- `node_modules/`
- 任何 `.credentials.yaml`、Session 日志、聊天截图

`.gitignore` 已经排除了这些路径。

## 3. 在 GitHub 创建空仓库

打开 <https://github.com/new>：

- Repository name：`dsh-plugin-token-hud`
- Visibility：`Public`
- 不要勾选 “Add a README file”“Add .gitignore”“Choose a license”
- 点击 **Create repository**

## 4. 关联远程仓库并推送

把 `<your-github-user>` 换成你的 GitHub 用户名：

```powershell
git remote add origin https://github.com/<your-github-user>/dsh-plugin-token-hud.git
git push -u origin main
```

如果使用 SSH：

```powershell
git remote add origin git@github.com:<your-github-user>/dsh-plugin-token-hud.git
git push -u origin main
```

## 5. 建议的仓库设置

在 GitHub 仓库页面：

1. 右上角 **About** → 添加：
   - Description：`Live token usage and DeepSeek balance HUD for DeepSeek Harness`
   - Topics：`dsh`、`deepseek-harness`、`plugin`、`token-usage`
2. **Settings → Actions → General** 确认允许运行 workflow。
3. **Releases → Draft a new release**：
   - Tag：`v0.3.3`
   - Title：`v0.3.3 — original token-pulse icon`
   - 说明参考 `CHANGELOG.md`
   - 可以附加 `artifacts/dsh-plugin-token-hud-0.3.3.tgz`（需要先在本地重新打包）
4. 第一次 push 后，`.github/workflows/ci.yml` 会自动跑语法检查和测试。

## 6. 后续发版

```powershell
# 修改 package.json 版本号和 CHANGELOG.md
npm run check
npm test
git add .
git commit -m "release: v0.2.1"
git tag v0.2.1
git push
git push --tags
```

如果想要通过 npm 发布，先把 `package.json` 里的 `"private": true` 去掉，再执行 `npm publish --access public`。只发 GitHub 不需要这一步。

## 7. 插件安装入口

别人可以：

- 在 DSH 插件管理器里输入 GitHub 地址：`github:<your-github-user>/dsh-plugin-token-hud`
- 或下载 Release 里的 tgz，在插件管理器选择本地包

推荐在 README 的安装章节补充实际的 GitHub 地址。
