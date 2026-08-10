# CloudCLI

Claude Code / Cursor CLI / Codex 的 Web UI。

## 1. 安装

需要 **Node.js 22+**。

```bash
git clone https://github.com/mrchen816/claudecodeui
cd claudecodeui
npm install
```

也可全局安装已发布包：

```bash
npm install -g @cloudcli-ai/cloudcli
```

## 2. 启动

从源码开发（前端热更新）：

```bash
npm run dev
```

- 前端：http://localhost:5173  
- 后端：http://localhost:3001  

生产模式（先构建再启动）：

```bash
npm start
```

或全局安装后：

```bash
cloudcli
```

浏览器打开 http://localhost:3001。

## 3. 部署到域名

以 `cloudcli.okayduck.com` 为例：本机跑服务，用 Cloudflare Tunnel 暴露到公网。

1. 本机启动服务（开发用 `npm run dev`，生产用 `npm start`）。
2. 安装并登录 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)，创建隧道并把域名指到本地端口：
   - 开发：`5173`
   - 生产：`3001`
3. 在 Cloudflare DNS 中把 `cloudcli.okayduck.com` 指向该隧道。

开发模式下，`vite.config.js` 已允许 Host `cloudcli.okayduck.com`。若换其他域名，在 `.env` 中设置：

```bash
ALLOWED_HOSTS=your.domain.com
```

生产模式由 Express 直接提供静态资源与 API/WebSocket，反代时需同时转发 HTTP 与 WebSocket（`/ws`、`/shell`、`/plugin-ws`）。子路径部署可参考 `docs/nginx-subpath-template.conf`。
