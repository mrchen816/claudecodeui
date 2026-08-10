# Dev 稳定性优化设计

**日期**: 2026-07-20  
**范围**: 方案 A（最小改动）  
**状态**: Approved

## 问题

开发模式下 `npm run dev` 频繁出现：

1. 后端 3001 挂掉但 Vite 5173 仍在运行 → 登录/API 报 `ECONNREFUSED`
2. `tsx watch` 重启时旧进程未释放端口 → `EADDRINUSE`，watch 进入僵死状态
3. `concurrently --kill-others` 导致一端退出时拖死另一端

对比 workbuddy（单进程 Next.js）后，cloudcli 的复杂度主要来自双进程 + 外部文件监听。

## 目标

- 开发时前后端互不拖累
- 后端重启能干净释放 3001
- 减少 dev 环境不必要的 chokidar 负载（Cursor/Claude 会话目录变更不再触发重型 watcher）

## 方案

### 1. Dev 脚本（`package.json`）

- `dev`: 移除 `--kill-others`
- `server:dev-watch`: 注入 `CLOUDCLI_DEV=1`（via `cross-env`）

### 2. Session watcher（`sessions-watcher.service.ts`）

当 `CLOUDCLI_DEV=1`：

- **保留** `sessionSynchronizerService.synchronizeSessions()` 初始同步（会话列表仍可用）
- **跳过** 所有 `chokidar.watch()` 调用（含 Cursor global state）
- 日志提示：`Dev mode: skipping filesystem watchers`

生产模式（`npm run server` / `npm start`）行为不变。

### 3. 优雅关闭（`server/index.js`）— 已完成

SIGTERM/SIGINT 时依次：关闭 watcher → browser → plugins → wss → http server → 移除 marker。

## 非目标

- 单端口/去 Vite 代理
- WebSocket 改 HTTP 轮询
- 插件子进程 dev 禁用

## 验证

1. `npm run dev` 启动后 3001/5173 均可用
2. 修改 `server/` 文件后后端能重启且端口释放
3. 杀 vite 进程时后端仍存活（反之亦然）
4. dev 日志出现 skipping filesystem watchers
