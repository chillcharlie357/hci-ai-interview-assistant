#!/usr/bin/env bash
# compose.sh — 一键启动/关闭 Docker Compose 服务栈
#
# 用法:
#   ./compose.sh up     启动开发模式（源码热重载）
#   ./compose.sh down   关闭所有服务
#   ./compose.sh prod   启动生产模式（前端构建后 nginx 部署）
#
# 环境变量:
#   COMPOSE_BIN        容器编排工具，默认自动检测 podman → docker
#   COMPOSE_PROFILE    模式 (dev / prod)，也可通过第二个参数传入

set -euo pipefail

# 项目根目录
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ============================
# 自动检测容器编排工具
# ============================
detect_compose_bin() {
  if command -v podman &>/dev/null; then
    echo "podman"
  elif command -v docker &>/dev/null; then
    echo "docker"
  else
    echo "Error: 未找到 podman 或 docker，请先安装容器引擎。" >&2
    exit 1
  fi
}

COMPOSE_BIN="${COMPOSE_BIN:-$(detect_compose_bin)}"

# ============================
# 启动服务
# ============================
compose_up() {
  local profile="${1:-dev}"
  local compose_cmd

  if [[ "$profile" == "prod" ]]; then
    # 生产模式：仅 docker-compose.yml
    compose_cmd="$COMPOSE_BIN compose -f \"$ROOT_DIR/docker-compose.yml\" up -d --build"
  else
    # 开发模式：叠加 docker-compose.dev.yml 启用热重载
    compose_cmd="$COMPOSE_BIN compose -f \"$ROOT_DIR/docker-compose.yml\" -f \"$ROOT_DIR/docker-compose.dev.yml\" up -d --build"
  fi

  echo ">>> 使用 $COMPOSE_BIN compose 启动服务 ($profile 模式)..."
  echo ">>> $compose_cmd"
  echo ""
  eval "$compose_cmd"

  echo ""
  echo ">>> 服务已启动："
  echo "    后端 API:   http://127.0.0.1:8000"
  echo "    前端页面:   http://127.0.0.1:5173"
  echo "    ASR 服务:   ws://127.0.0.1:9785/"
  echo ""
  echo "    查看日志: $COMPOSE_BIN compose -f \"$ROOT_DIR/docker-compose.yml\" logs -f"
  echo "    关闭服务:  ./compose.sh down"
}

# ============================
# 关闭服务
# ============================
compose_down() {
  local compose_cmd="$COMPOSE_BIN compose -f \"$ROOT_DIR/docker-compose.yml\" down"

  echo ">>> 关闭所有服务..."
  eval "$compose_cmd"
  echo ">>> 已关闭。"
}

# ============================
# 入口
# ============================
case "${1:-}" in
  up|start|dev)
    compose_up "dev"
    ;;
  prod)
    compose_up "prod"
    ;;
  down|stop)
    compose_down
    ;;
  *)
    echo "用法: $0 <up|down|prod>"
    echo ""
    echo "  up       启动开发模式（默认，含前端 Vite HMR 和后端 watchfiles 热重载）"
    echo "  down     关闭所有服务"
    echo "  prod     启动生产模式（前端构建后由 nginx 部署）"
    exit 1
    ;;
esac
