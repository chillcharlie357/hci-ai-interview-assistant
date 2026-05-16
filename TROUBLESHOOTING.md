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
