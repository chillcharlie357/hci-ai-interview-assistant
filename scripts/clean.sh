#!/usr/bin/env bash
# clean.sh — 清理旧的 Docker/Podman 产物
#
# 停止并删除 hci-* 容器、镜像、网络、卷。
# 自动检测 podman 或 docker。
#
# 用法:
#   ./scripts/clean.sh            查看将要删除的内容（干跑）
#   ./scripts/clean.sh --force    确认执行清理
#
# 环境变量:
#   COMPOSE_BIN  容器引擎，默认自动检测 podman → docker

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── 容器引擎检测 ──
detect_bin() {
  if [[ -n "${COMPOSE_BIN:-}" ]]; then
    echo "$COMPOSE_BIN"
    return
  fi
  if command -v podman &>/dev/null; then
    echo "podman"
  elif command -v docker &>/dev/null; then
    echo "docker"
  else
    echo "Error: 未找到 podman 或 docker。" >&2
    exit 1
  fi
}

BIN="$(detect_bin)"
DRY_RUN=true
[[ "${1:-}" == "--force" ]] && DRY_RUN=false

echo ">>> 容器引擎: $BIN"
echo ""

# ── 确保 compose down ──
if $DRY_RUN; then
  echo "[干跑] 将执行: $BIN compose -f $ROOT_DIR/docker-compose.yml down"
else
  echo ">>> 停止 compose 服务栈..."
  "$BIN" compose -f "$ROOT_DIR/docker-compose.yml" down 2>/dev/null || true
fi

# ── 查找 hci-* 相关容器 ──
containers=$("$BIN" ps -a --filter name='^/' -a --format '{{.Names}}' 2>/dev/null | grep -E '^hci-' || true)

if [[ -z "$containers" ]]; then
  echo ">>> 没有找到 hci-* 容器。"
else
  echo ""
  echo ">>> 找到以下 hci-* 容器："
  echo "$containers" | sed 's/^/  - /'

  if $DRY_RUN; then
    echo "[干跑] 将停止并删除上述容器。"
  else
    echo ">>> 停止并删除容器..."
    echo "$containers" | while IFS= read -r c; do
      "$BIN" rm -f "$c" 2>/dev/null || true
    done
    echo "    已清理。"
  fi
fi

# ── 查找 hci-* 相关镜像 ──
images=$("$BIN" images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E '^hci-' | sort -u || true)

if [[ -z "$images" ]]; then
  echo ">>> 没有找到 hci-* 镜像。"
else
  echo ""
  echo ">>> 找到以下 hci-* 镜像："
  echo "$images" | sed 's/^/  - /'

  if $DRY_RUN; then
    echo "[干跑] 将删除上述镜像。"
  else
    echo ">>> 删除镜像..."
    echo "$images" | while IFS= read -r img; do
      "$BIN" rmi -f "$img" 2>/dev/null || true
    done
    echo "    已清理。"
  fi
fi

# ── 查找 hci-* 相关网络 ──
networks=$("$BIN" network ls --format '{{.Name}}' 2>/dev/null | grep -E '^hci-' || true)

if [[ -z "$networks" ]]; then
  echo ">>> 没有找到 hci-* 网络。"
else
  echo ""
  echo ">>> 找到以下 hci-* 网络："
  echo "$networks" | sed 's/^/  - /'

  if $DRY_RUN; then
    echo "[干跑] 将删除上述网络。"
  else
    echo ">>> 删除网络..."
    echo "$networks" | while IFS= read -r n; do
      "$BIN" network rm "$n" 2>/dev/null || true
    done
    echo "    已清理。"
  fi
fi

# ── 查找 hci-* 相关卷 ──
volumes=$("$BIN" volume ls --format '{{.Name}}' 2>/dev/null | grep -E '^hci-' || true)

if [[ -z "$volumes" ]]; then
  echo ">>> 没有找到 hci-* 卷。"
else
  echo ""
  echo ">>> 找到以下 hci-* 卷："
  echo "$volumes" | sed 's/^/  - /'

  if $DRY_RUN; then
    echo "[干跑] 将删除上述卷。"
  else
    echo ">>> 删除卷..."
    echo "$volumes" | while IFS= read -r v; do
      "$BIN" volume rm "$v" 2>/dev/null || true
    done
    echo "    已清理。"
  fi
fi

# ── 清理悬空资源 ──
if ! $DRY_RUN; then
  echo ""
  echo ">>> 清理悬空资源..."
  "$BIN" system prune -f 2>/dev/null || true
fi

echo ""
if $DRY_RUN; then
  echo ">>> 以上为干跑结果。确认执行请加 --force 参数。"
else
  echo ">>> 清理完成。"
fi
