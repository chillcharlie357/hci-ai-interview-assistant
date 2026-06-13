# Troubleshooting Guide

## Port 8000: 宿主机残留进程拦截容器请求

**症状**：前端 resume 上传一直 Pending、后端无请求日志、`curl 127.0.0.1:8000/api/health` 能通但其他端点挂死。

**根因**：`compose down` 只停止容器。宿主机上之前用 `uv run python -m backend.interview.api` 直接启动的进程仍然监听 `127.0.0.1:8000`（IPv4）。Podman gvproxy 监听 `[::]:8000`（IPv6），二者不冲突也不报错，但 curl 到 `127.0.0.1:8000` 走 IPv4 被旧进程拦截。

**修复**：
```bash
lsof -i :8000 -P | grep LISTEN   # 检查端口占用（除 gvproxy 外不应有其他进程）
kill <PID>                        # 杀旧进程
lsof -i :8000 -P | grep LISTEN   # 确认干净
```

## Health Check 在 podman-compose 1.5.0 下报 SyntaxError

**症状**：容器状态显示 `unhealthy`，health check 日志报 `SyntaxError: invalid syntax`，错误指向 `import` 关键字。

**根因**：`CMD` exec 形式的 YAML 多行列表被 podman-compose 1.5.0 错误拼接，`python -c` 仅收到 `import` 关键字。

**修复**：使用 `CMD-SHELL` 单行格式：
```yaml
healthcheck:
  test: ["CMD-SHELL", "uv run python -c 'import urllib.request, sys; sys.exit(0 if urllib.request.urlopen(\"http://localhost:8000/api/health\").status == 200 else 1)'"]
```

## compose down 不清除构建缓存和镜像

**要点**：
| 操作 | 效果 |
|------|------|
| `down && up` | 容器重建，**镜像复用**，挂载卷保留 |
| `down && up --build` | 镜像重建（layer 缓存） |
| `build --no-cache && up` | 完全从零构建 |
| `.env` 改动 | 只需 `down && up`（env 在容器启动时读取，仅 `restart` 不够） |

## 磁盘空间清理

大量 `<none>` 悬挂镜像占用磁盘，可在 `down` 后运行：
```bash
podman system prune -af
```

## 直接测试后端 resume 端点（绕过前端）

```bash
B64=$(base64 -i mock-resumes/frontend_senior_li_ming.pdf | tr -d '\n')
curl -s --max-time 300 -X POST http://127.0.0.1:8000/api/prep-sessions/resume \
  -H "Content-Type: application/json" \
  -d "{\"file_name\":\"resume.pdf\",\"data_base64\":\"$B64\"}"
```

如果返回 `400 mineru_failed` / `retry limit reached`，确认 Token 有效且容器环境变量已注入：
```bash
podman exec hci-backend-1 env | grep MINERU
```

## 单元测试环境变量干扰

`MINERU_API_TOKEN` 在环境中设置时，mock 测试会走真实 Precision API 而非模拟路径。

**修复**：在 `@patch.dict` 中显式清空：
```python
@patch.dict(os.environ, {"MINERU_API_TOKEN": ""}, clear=False)
```

## MinerU 解析慢或超时

- Precision API（有 Token）约 3-5 秒完成简历提取
- Agent API（无 Token）约 190 秒（IP 限流）
- 超时配置：`MINERU_TIMEOUT_SEC`（默认 300）
- 确认容器使用 Precision API：`curl -s http://localhost:8000/api/health | python3 -c "import sys,json; print(json.load(sys.stdin)['components']['mineru'])"`

## Supabase Storage SSL 握手超时（视频加载失败）

**症状**：报告页「面试回放」区域卡在"加载视频中..."（约 30 秒），然后消失或报错。后端日志无对应 `GET /api/sessions/{id}/video -> 200` 行，或返回 500 `{"error": "storage_error"}`。

**根因**：Docker 容器访问 Supabase Storage API 时 SSL/TLS 握手超时（`_ssl.c:993: The handshake operation timed out`）。Supabase REST API（数据查询）和 Storage API（文件上传/下载）走同一域名但不同子路径，网络策略可能影响其中一条。

**验证**：在容器内直接测试 Storage 连通性：
```bash
docker compose exec backend curl -v https://<project-id>.supabase.co/storage/v1/bucket 2>&1 | head -20
```

**临时方案**：如果 Supabase Storage 不可达，视频上传/下载均会失败。上传失败会在 session 中标记 `video_upload_failed: true`，面试流程不受影响。下载失败会在前端显示"视频加载失败"。

## Vite HMR 未触发 `.ts` 文件变更

**症状**：编辑 `frontend/src/` 下的 `.ts`/`.tsx` 文件后，浏览器中代码未更新（控制台日志仍显示旧格式字符串）。

**根因**：Docker 卷挂载（`./frontend/src:/app/src`）文件同步延迟，或 Vite 文件监听在 Docker 环境下未正确检测到变更。`.ts` 文件（非组件）的 HMR 更新有时需要完整页面刷新才能生效。

**修复**：
```bash
# 方法 1：重启前端容器触发完整重编译
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart frontend

# 方法 2：强制浏览器硬刷新（忽略缓存）
Ctrl+Shift+R 或 Cmd+Shift+R
```

## TTS 结束后按钮状态不同步

**症状**：面试官 TTS 朗读结束后面板仍显示"提问中"、按钮仍 disabled。

**根因**：浏览器 `SpeechSynthesis.onend` 事件在某些环境下不触发（如无音频输出设备）。

**临时方案**：手动刷新页面，面试进度已保存到数据库。按钮会随面试进度自动恢复。`speakQuestion` 缺少超时保护，TTS 无输出时 `onend` 永远不触发。

## 前端容器跑成 nginx（生产镜像）而非 Vite dev

**症状**：`docker compose exec frontend which pnpm` 返回空，`ls /app` 返回 `No such file or directory`，前端不热重载。

**根因**：`docker compose up` 不带 `--build` 时复用现有镜像。如果上次 build 未指定 `--target dev`，`latest` tag 指向 prod 阶段（nginx:alpine），不包含 node/pnpm。

**修复**：
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

**验证**：`docker compose exec frontend which pnpm` 应返回 `/usr/local/bin/pnpm`。
