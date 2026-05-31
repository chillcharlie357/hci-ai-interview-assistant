# 端口配置指南

## 端口体系总览

| 服务 | 容器内部 | 宿主机映射 | 本地开发 (dev.sh) |
|------|---------|-----------|------------------|
| Backend API | 8000 | 9000 | 8000 |
| ASR WebSocket | 8765 | 9100 | 8765 |
| Frontend | 5173 | 5173 | 5173 |

- **容器内部端口**：Docker 容器内进程监听的端口，跨服务通信用（如 frontend 容器通过 Vite proxy 访问 backend 时用 `http://backend:8000`）。
- **宿主机映射端口**：Docker 映射到宿主机的端口，浏览器和外部工具通过这个端口访问。
- **本地开发端口**：`dev.sh` 直起进程时的端口，不经过 Docker。

## 修改端口时必须检查的所有位置

端口散落在多个层级，改一处漏一处就会出问题。以下按服务逐一列出。

### Backend API 端口（当前：容器内 8000 / 宿主机 9000）

| 文件 | 行为 | 说明 |
|------|------|------|
| `docker-compose.yml` `ports` | `"9000:8000"` | 宿主机映射 |
| `docker-compose.yml` `environment` | `VITE_API_BASE_URL: ...http://127.0.0.1:9000` | 前端构建时/运行时 API 地址 |
| `docker-compose.dev.yml` | `--port 8000` | 容器内启动命令，一般不改 |
| `.env` / `.env.example` | `VITE_API_BASE_URL=http://127.0.0.1:9000` | **最高优先级**，会覆盖 docker-compose 的 environment 默认值 |
| `frontend/src/config.ts` | `"http://127.0.0.1:8000"` | 本地开发回退值（`VITE_API_BASE_URL` 未设时使用） |
| `frontend/vite.config.ts` | `target: "http://127.0.0.1:8000"` | Vite dev proxy 目标（仅本地开发 `/api` 代理使用） |
| `scripts/dev.sh` | `API_PORT="${API_PORT:-8000}"` | 本地开发启动脚本 |
| `scripts/e2e.sh` | `API_PORT="${API_PORT:-8000}"` | E2E 测试脚本 |
| `README.md` | Exposed ports 段落 | 文档 |

### ASR WebSocket 端口（当前：容器内 8765 / 宿主机 9100）

| 文件 | 行为 | 说明 |
|------|------|------|
| `docker-compose.yml` `ports` | `"9100:8765"` | 宿主机映射 |
| `docker-compose.yml` `environment` | `ASR_WS_PORT: "8765"` | 容器内 ASR 服务监听端口 |
| `docker-compose.yml` `environment` | `VITE_ASR_WS_URL: ...ws://127.0.0.1:9100/` | 前端 ASR 连接地址 |
| `docker-compose.yml` `command` | `--port "8765"` | 容器内启动命令 |
| `.env` / `.env.example` | `VITE_ASR_WS_URL=ws://127.0.0.1:9100/` | **最高优先级** |
| `.env` / `.env.example` | `ASR_WS_PORT=8765` | 本地开发 ASR 端口 |
| `frontend/src/qwenAsrStream.ts` | `8765` 硬编码 | 本地开发回退值（`VITE_ASR_WS_URL` 未设时使用） |
| `backend/asr/qwen_realtime.py` | `port: int = 8765` | 默认参数 |
| `scripts/dev.sh` | `ASR_WS_PORT="${ASR_WS_PORT:-8765}"` | 本地开发启动脚本 |
| `README.md` | Exposed ports 段落 | 文档 |

## 踩坑记录

### 1. Windows Hyper-V 保留端口

Windows Hyper-V 会动态保留大段端口范围，**即使没有程序占用也无法绑定**，报错为 `An attempt was made to access a socket in a way forbidden by its access permissions`（注意跟普通端口占用的 `Only one usage of each socket address` 报错不同）。

查看当前保留范围：
```bash
netsh interface ipv4 show excludedportrange protocol=tcp
```

当前本机保留范围覆盖了 **7149~8239**，所以 8000、8100、8765、9785 全部不安全。宿主机端口选在 **9000+** 区间可避开。

### 2. `.env` 文件优先级高于 docker-compose `environment`

`docker-compose.yml` 中同时有 `env_file: .env` 和 `environment` 段时：
- `.env` 中的变量会被注入容器
- `environment` 中 `${VITE_API_BASE_URL:-http://127.0.0.1:9000}` 的 `:-` 默认值**仅在 `.env` 中未定义该变量时生效**
- 如果 `.env` 里写了旧值 `VITE_API_BASE_URL=http://127.0.0.1:8100`，docker-compose 的默认值就被覆盖了

**所以改端口时必须同时改 `.env` 和 `.env.example`，不能只改 docker-compose.yml。**

### 3. Vite 环境变量是构建时替换

`import.meta.env.VITE_*` 在 Vite dev server 模式下可以读取运行时环境变量，但 production 构建时会被**静态替换**。Docker 里用的是 dev server（`pnpm dev`），所以运行时环境变量可以生效。

### 4. 前端 API 请求不走 Vite Proxy

`apiClient.ts` 中所有请求使用完整绝对 URL（`${baseUrl}${path}`），`baseUrl` 来自 `getApiBaseUrl()` 返回的 `VITE_API_BASE_URL`。请求从**浏览器**直接发出到宿主机映射端口，不经过 Vite dev proxy。

Vite proxy（`vite.config.ts` 中的 `server.proxy`）仅对**相对路径请求**生效，本项目不适用。修改 Docker 网络配置时不需要考虑 Vite proxy。

## 修改端口的完整步骤

以"将 Backend API 宿主机端口从 9000 改为 XXXX"为例：

1. 确认目标端口不在 Hyper-V 保留范围内：`netsh interface ipv4 show excludedportrange protocol=tcp`
2. 修改 `docker-compose.yml` 的 `ports` 映射和 `VITE_API_BASE_URL` 默认值
3. 修改 `.env` 和 `.env.example` 中的 `VITE_API_BASE_URL`
4. 修改 `README.md` 中的 Exposed ports
5. **不要改**容器内部端口（8000）、本地开发端口、回退值——除非要同时改本地开发端口
6. 重启 `docker compose up --build`
