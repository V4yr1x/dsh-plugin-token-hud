# Token 与余额 · DSH 插件

[![CI](https://github.com/V4yr1x/dsh-plugin-token-hud/actions/workflows/ci.yml/badge.svg)](https://github.com/V4yr1x/dsh-plugin-token-hud/actions/workflows/ci.yml)

在 DeepSeek Harness 的**左下角侧边栏底部**显示当前会话的 Token 消耗、上下文占用，以及 DeepSeek 账户的充值余额和今日消费。

> 位置：侧边栏 Settings 上方，和截图里的账户摘要一样位于左下角。默认两条摘要；点击展开明细。

## 显示内容

**收起状态**

- 当前会话总 Token（输入 + 缓存读取 + 缓存写入 + 输出）
- 左侧使用原创的 Token 脉冲图标（圆环 + 心跳线）
- 模型生成时**实时增长**，脉冲图标出现蓝色光晕，数字前显示 `~`
- DeepSeek 充值余额
- 今日消费

**展开状态**

- 详情在卡片上方**就地展开**，不再覆盖会话列表；侧边栏列表只会向上让出空间，仍可继续滚动
- 详情自身限高并可滚动，不会把整列撑满
- 点击详情右上角 `×`、卡片外部或按 `Esc` 关闭
- 输入、缓存读取、缓存写入、输出、合计、缓存命中率
- 上下文占用进度条（有 `contextPressure` 数据时）
- 充值余额、今日消费、赠金余额
- 手动刷新余额、最后更新时间

**数字动画**

- 所有关键数字使用逐位滚动的里程表效果
- 余额下降时数字闪琥珀色，增加时闪蓝色
- 展开/收起有轻量弹入动画，实时生成有蓝色脉冲

运行中的会话会在脉冲图标上显示一个绿色小点；模型实时生成时，图标出现蓝色光晕，Token 数字前显示 `~`。

## 数据来源

| 数据 | 来源 |
|---|---|
| Token 用量 | 当前会话的 `tokenUsage` 投影（Host 统计的 provider 报告用量） |
| 实时增量 | 当前会话 `eventSource` 的 `assistant/live-chunk`；按文本/推理/工具参数估算，收到 provider `usage` 块后改用精确值 |
| 上下文占用 | 当前会话的 `contextPressure` 投影 |
| 充值余额、赠金 | DeepSeek 账户 `account.getBalance`，每 60 秒刷新，并在每轮结束后重读 |
| 今日消费 | 本机记录当天余额的下降量；充值导致的上升不计入 |

余额和今日消费需要先在 **设置 → 账号与余额** 登录 DeepSeek 账户。Token 统计不依赖登录状态。

> “今日消费”是本插件在当天观察到的账户余额下降累计。它不是 Platform 的账单接口；如果当天在插件启动前已经消费，或通过其他设备消费，首次读取只能从当前余额开始记录。充值不会被算作消费。

## 安装

### 从 GitHub Release 安装（推荐）

1. 打开 [v0.3.3 Release](https://github.com/V4yr1x/dsh-plugin-token-hud/releases/tag/v0.3.3)。
2. 下载 `dsh-plugin-token-hud-0.3.3.tgz`。
3. 在 DSH **设置 → 插件** 中选择本地包安装。

### 从 GitHub 仓库安装

在 DSH 插件管理器的安装地址里输入：

```text
github:V4yr1x/dsh-plugin-token-hud
```

### 本地目录安装

1. 打开 DSH 的 **设置 → 插件**（或插件管理器）。
2. 选择从**本地目录/路径**安装。
3. 输入本仓库的绝对路径（例如 `C:\path\to\dsh-plugin-token-hud`）。
4. 安装后确认插件列表中显示 **Token 与余额**。

首次加载后刷新页面；如果宿主尚未重新组合新插件行，完全退出 DSH 再重新打开。

### 手动接入 profile（可选）

把本仓库链接到当前 profile 的 `node_modules`，并在 profile 的
`cordis.patch.yml` 中追加：

```yaml
- insert:
    - id: token-hud
      name: dsh-plugin-token-hud
```

不要同时在 profile 的 `package.json` 和 `cordis.patch.yml` 两处注册，避免重复加载。

## 开发与检查

无构建步骤，纯 ESM + 浏览器端 CommonJS 工厂。

```powershell
npm run check
npm test
```

`tests/smoke.mjs` 用最小 React 桩渲染收起、展开和侧边栏折叠三种状态，检查槽位注册、文案和可访问标签；`tests/live.mjs` 模拟 `assistant/live-chunk` 的文本、provider `usage` 块和落盘事件，验证实时数字增长、切换为精确值以及结算后消失。两个测试都不连接真实 DSH，也不替代浏览器验收。

## 卸载/回滚

- 通过插件管理器安装的：在插件管理器中移除 **Token 与余额**。
- 手动 patch 安装的：删除 profile `cordis.patch.yml` 中的 `token-hud` 注册块，并删除 profile `node_modules` 中的链接，然后刷新页面或重启 DSH。

## 图标

`icon.svg` 和左下角的脉冲图标是为本插件原创绘制的：圆环代表稳定的会话，心跳线代表实时 Token 流。图标使用 MIT 许可，不包含 DeepSeek 品牌素材。

## 隐私

- 不读取 Session 正文、工具参数或凭据。
- 不发起模型请求，不监听端口，不写远程遥测。
- 余额读取走 DSH 已有的认证 Remote 通道；本插件只拿到钱包金额。
- 展开状态和余额变化记录保存在浏览器 `localStorage`。

## 已知限制

- 账户必须已登录；未登录时余额显示“未登录”，Token 仍正常显示。
- 实时数字在流式生成期间按字符估算（中文按约 1.5 字/token、其他文本按约 4 字符/token），收到 provider 的 `usage` 块后切换到该次请求的精确用量；完成落盘后由会话 `tokenUsage` 统计校正，所以实时数字前会显示 `~`。
- 今日消费依赖余额变化，跨设备消费和赠金过期可能造成偏差。
- 侧边栏折叠时只显示一个带提示文字的图标。
