# Codex Proxy

本仓库是基于 [icebear0828/codex-proxy](https://github.com/icebear0828/codex-proxy) 维护的个人 fork。

目标很简单：把 ChatGPT / Codex 订阅能力通过本地代理暴露成 OpenAI、Anthropic、Codex Responses 等常见协议，方便 Claude Code、Codex CLI、Cursor 等客户端使用。

这个 README 保留本 fork 日常维护和使用需要的信息，删除了原仓库中偏宣传、赞赏、交流群、长客户端清单和过细 API 说明。

## 功能重点

- OpenAI 兼容接口：`/v1/chat/completions`
- Anthropic 兼容接口：`/v1/messages`
- Codex Responses 直通：`/v1/responses`
- Claude Code 可通过 `ANTHROPIC_BASE_URL` 接入
- 支持模型别名，把 Claude 模型名映射到 Codex 模型
- 支持 Codex reasoning effort：`minimal` / `low` / `medium` / `high` / `xhigh`
- Web 控制台查看账号、配置、日志和请求详情
- macOS 下提供 `launchctl` 生产运行脚本

## 本地开发

```bash
git clone git@github.com:liangzhiyang/codex-proxy.git
cd codex-proxy

npm install
cd web && npm install && cd ..

npm run dev
```

打开控制台：

```text
http://127.0.0.1:8080
```

源码运行需要 Rust 工具链编译 native TLS addon：

```bash
cd native
npm install
npm run build
cd ..
```

如果 `npm install` 卡在 Electron 下载，可以指定镜像：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
```

## 生产运行

先构建：

```bash
npm run build
```

macOS 可以用内置脚本交给 `launchctl` 管理：

```bash
scripts/codex-proxy-prod.sh start
scripts/codex-proxy-prod.sh status
scripts/codex-proxy-prod.sh logs
scripts/codex-proxy-prod.sh restart
scripts/codex-proxy-prod.sh stop
```

默认运行文件：

```text
plist: ~/.codex-proxy/com.codex-proxy.local.plist
log:   ~/.codex-proxy/codex-proxy.log
```

脚本要求 `dist/index.js` 已存在，所以改代码后需要先重新执行 `npm run build`，再 `restart`。

## 基础配置

本地覆盖配置写在 `data/local.yaml`。常用配置示例：

```yaml
server:
  host: "127.0.0.1"
  port: 19527
  proxy_api_key: "your-local-key"

tls:
  proxy_url: "http://127.0.0.1:<proxy-port>"
  force_http11: true

model:
  default: gpt-5.5
  default_reasoning_effort: high
  aliases:
    claude-haiku-4-5: gpt-5.4-mini
    claude-haiku-4-5-20251001: gpt-5.4-mini
    claude-opus-4-7: gpt-5.5
    claude-opus-4-7[1m]: gpt-5.5
    claude-sonnet-4-6: gpt-5.4

logs:
  enabled: true
  capture_body: false
```

注意：

- `proxy_api_key` 是本代理自己的访问密钥，客户端请求时使用 `Authorization: Bearer your-local-key`。
- 如果本地使用 Shadowrocket、Clash 等代理，建议显式配置 `tls.proxy_url`。即使系统启用了 TUN / VPN 模式，进程仍可能因为路由、DNS、应用层连接方式或规则设置绕过代理。
- 修改监听端口、默认模型、上游代理后，建议重启服务。

## Claude Code 接入

Claude Code 使用 Anthropic 协议，配置示例：

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:19527
export ANTHROPIC_API_KEY=your-local-key

export ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-7
export ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-6
export ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4-5-20251001

claude
```

如果想绕过 Claude 模型名，也可以直接指定 Codex 模型：

```bash
export ANTHROPIC_MODEL=gpt-5.5
```

Claude Code 里 `/model` 控制模型名，`/effort` 控制推理等级。代理会把 Anthropic 请求转换成 Codex Responses 请求。

### Claude Code Statusline

仓库内置了一个基于 `claude-hud` 的 statusline 示例，用来显示 Codex usage、上下文窗口和 effort 等信息：

```bash
node examples/claude-code/statusline/install.mjs
```

详情见 [examples/claude-code/statusline](./examples/claude-code/statusline)。

## Effort 映射规则

本 fork 修正了 Claude Code `/effort` 到 Codex reasoning effort 的优先级。

最终优先级：

```text
Claude Code output_config.effort
> 模型名后缀
> data/local.yaml 的 model.default_reasoning_effort
> legacy thinking budget
```

支持值：

```text
none
minimal
low
medium
high
xhigh
```

兼容别名：

```text
max -> xhigh
```

模型名后缀示例：

```text
gpt-5.5-xhigh
gpt-5.5-high
gpt-5.4-mini-low
```

如果日志里看到 `output_config_effort: null`，说明当前 Claude Code 请求没有发送 `/effort` 的 `output_config.effort` 字段。这时可以用模型名后缀或 `model.default_reasoning_effort` 兜底。

## 验证请求

OpenAI 兼容接口：

```bash
curl http://127.0.0.1:19527/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-local-key" \
  -d '{"model":"gpt-5.5","messages":[{"role":"user","content":"Hello!"}],"stream":true}'
```

Anthropic 兼容接口：

```bash
curl http://127.0.0.1:19527/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-local-key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model":"claude-sonnet-4-6",
    "max_tokens":1024,
    "messages":[{"role":"user","content":"Hello!"}],
    "output_config":{"effort":"high"},
    "stream":true
  }'
```

日志中重点看：

```text
ingress.request.output_config_effort
ingress.request.thinking_budget_effort
egress.request.reasoning.effort
```

## 常见问题

### Invalid proxy API key

请求里的 Bearer token 必须和 `data/local.yaml` 中的 `server.proxy_api_key` 一致。

例如配置是：

```yaml
server:
  proxy_api_key: "your-local-key"
```

请求头就应该是：

```text
Authorization: Bearer your-local-key
```

不要额外加 `sk-`，除非配置里本身就写了 `sk-...`。

### tunnel error: unsuccessful

通常是上游代理不可用、代理地址没配置到服务进程、或进程没有走系统 TUN。

建议显式配置：

```yaml
tls:
  proxy_url: "http://127.0.0.1:<proxy-port>"
  force_http11: true
```

然后重启服务。

### curl https://chatgpt.com 返回 403

`curl -I https://chatgpt.com` 返回 Cloudflare challenge / 403 不一定代表代理不可用。浏览器带完整指纹、Cookie 和 JS challenge；curl 没有这些上下文。排查代理时更应该看 codex-proxy 自己的请求日志和 WebSocket / TLS 错误。

### Claude Code 仍然进入登录选择

常见原因：

- 当前 shell 没有加载 `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY`
- 配置写在了另一个 shell profile
- 启动 Claude Code 的终端不是同一个环境
- API key 错误，导致 Claude Code 回退到登录流程

可以先在同一个终端确认：

```bash
env | rg 'ANTHROPIC|CLAUDE'
```

## 测试

```bash
npm test
npx tsc --noEmit
npm run build
```

针对本 fork 修改过的关键测试：

```bash
npm test -- \
  tests/unit/translation/anthropic-to-codex.test.ts \
  tests/unit/logs/request-summary.test.ts \
  tests/unit/types/schemas.test.ts
```

## License

遵循上游仓库的许可协议。使用、分发和商业用途限制以原项目 license 文件为准。
