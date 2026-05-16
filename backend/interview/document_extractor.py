from __future__ import annotations

import base64
from dataclasses import dataclass
import io
import json
import logging
import time as _time
import typing
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

from backend.interview.config import get_env


log = logging.getLogger("backend.document_extractor")

SUPPORTED_RESUME_SUFFIXES = {".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp"}
MAX_RESUME_BYTES = 12 * 1024 * 1024
MINERU_API_BASE = "https://mineru.net"
_MINERU_POLL_INTERVAL = 3  # seconds between poll attempts


@dataclass(frozen=True)
class ExtractedDocument:
    markdown: str


class DocumentExtractionError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def extract_resume_markdown(file_name: str, data_base64: str) -> ExtractedDocument:
    log.info("extracting resume: file_name=%s, base64_len=%d", file_name, len(data_base64))
    suffix = Path(file_name).suffix.lower()
    if suffix not in SUPPORTED_RESUME_SUFFIXES:
        log.warning("unsupported resume format: suffix=%s, file_name=%s", suffix, file_name)
        raise DocumentExtractionError("unsupported_resume_format", "支持 PDF、DOCX、PNG、JPG、JPEG、WEBP 简历。")

    try:
        raw = base64.b64decode(data_base64, validate=True)
    except Exception as exc:
        log.warning("resume base64 decode failed: %s", exc)
        raise DocumentExtractionError("invalid_resume_payload", "简历文件 base64 内容无效。") from exc

    file_size_kb = len(raw) / 1024
    log.info("resume decoded: file_size=%.1fKB, suffix=%s", file_size_kb, suffix)

    if not raw:
        log.warning("resume file is empty: file_name=%s", file_name)
        raise DocumentExtractionError("empty_resume_file", "简历文件为空。")
    if len(raw) > MAX_RESUME_BYTES:
        log.warning("resume file too large: %.1fKB > max=%.1fKB", file_size_kb, MAX_RESUME_BYTES / 1024)
        raise DocumentExtractionError("resume_file_too_large", "简历文件超过 12MB。")

    timeout = int(get_env("MINERU_TIMEOUT_SEC", "300") or "300")
    token = get_env("MINERU_API_TOKEN", "").strip()

    if token:
        log.info("using MinerU Precision API (token configured, timeout=%ds, file=%s)", timeout, file_name)
        start = _time.time()
        markdown = _extract_via_precision_api(raw, file_name, timeout, token)
        elapsed = _time.time() - start
    elif get_env("MINERU_COMMAND", "").strip():
        # 旧版 CLI 模式（已弃用，保留向后兼容）
        log.warning("MINERU_API_TOKEN not set, falling back to deprecated CLI mode: file=%s", file_name)
        start = _time.time()
        markdown = _extract_via_cli(raw, file_name, timeout)
        elapsed = _time.time() - start
    else:
        log.info("using MinerU Agent API (no token, fallback, timeout=%ds, file=%s)", timeout, file_name)
        start = _time.time()
        markdown = _extract_via_agent_api(raw, file_name, timeout)
        elapsed = _time.time() - start

    log.info("resume extraction succeeded: file=%s, extracted_len=%d chars, elapsed=%.2fs",
             file_name, len(markdown), elapsed)
    return ExtractedDocument(markdown=markdown)


# ──────────────────────────────────────────────
# 旧版 CLI 模式（已弃用，保留向后兼容）
# ──────────────────────────────────────────────

def _extract_via_cli(raw_bytes: bytes, file_name: str, timeout: int) -> str:
    """通过 CLI 调用 mineru-open-api（已弃用，优先使用 API 直连）。"""
    import subprocess
    import tempfile

    command = get_env("MINERU_COMMAND", "mineru-open-api")
    log.info("calling mineru CLI: command=%s, timeout=%ds, file=%s", command, timeout, file_name)
    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file_name).suffix) as handle:
            handle.write(raw_bytes)
            temp_path = handle.name
        log.debug("temp file written: %s", temp_path)
        completed = subprocess.run(
            [command, "flash-extract", temp_path],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
        log.info("mineru CLI completed: returncode=%d, stdout_len=%d, stderr_len=%d",
                 completed.returncode, len(completed.stdout), len(completed.stderr))
        if completed.stderr.strip():
            log.debug("mineru CLI stderr: %s", completed.stderr.strip()[:500])
    except FileNotFoundError as exc:
        log.error("mineru CLI command not found: %s", command)
        raise DocumentExtractionError("mineru_not_found", "未找到 mineru-open-api，请先安装 MinerU CLI。") from exc
    except subprocess.TimeoutExpired as exc:
        log.warning("mineru CLI timed out after %ds: file=%s", timeout, file_name)
        raise DocumentExtractionError("mineru_timeout", "MinerU 解析超时，请压缩简历或稍后重试。") from exc
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
            log.debug("temp file cleaned: %s", temp_path)

    if completed.returncode != 0:
        stderr_snippet = (completed.stderr.strip() or "MinerU 解析失败。")[:300]
        log.warning("mineru CLI failed: returncode=%d, stderr=%s", completed.returncode, stderr_snippet)
        raise DocumentExtractionError("mineru_failed", completed.stderr.strip() or "MinerU 解析失败。")
    markdown = completed.stdout.strip()
    if not markdown:
        log.warning("mineru CLI returned empty text: file=%s", file_name)
        raise DocumentExtractionError("empty_resume_text", "MinerU 未提取到简历文本。")
    return markdown


# ──────────────────────────────────────────────
# Agent Lightweight API（无需 Token）
# ──────────────────────────────────────────────

def _extract_via_agent_api(raw_bytes: bytes, file_name: str, timeout: int) -> str:
    """Agent Lightweight API — 无需 Token，通过 multipart 上传文件。"""
    deadline = _time.time() + timeout

    # Step 1: 上传文件
    log.info("agent_api: uploading file=%s size=%dKB", file_name, len(raw_bytes) // 1024)
    task_id = _agent_api_upload(raw_bytes, file_name, deadline)
    log.info("agent_api: upload done, task_id=%s", task_id)

    # Step 2: 轮询结果
    markdown_url = _agent_api_poll(task_id, deadline)
    log.info("agent_api: result ready, downloading markdown from %s", markdown_url)

    # Step 3: 下载 Markdown
    return _download_text(markdown_url, deadline)


def _agent_api_upload(raw_bytes: bytes, file_name: str, deadline: float) -> str:
    """上传文件到 Agent API，返回 task_id。"""
    import uuid

    boundary = uuid.uuid4().hex
    body_parts = [
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="file"; filename="{file_name}"\r\n'.encode(),
        b"Content-Type: application/octet-stream\r\n\r\n",
        raw_bytes,
        f"\r\n--{boundary}--\r\n".encode(),
    ]
    body = b"".join(body_parts)

    req = urllib.request.Request(
        f"{MINERU_API_BASE}/api/v1/agent/parse/file",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )

    remaining = max(30, deadline - _time.time())
    try:
        with urllib.request.urlopen(req, timeout=remaining) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:500]
        raise DocumentExtractionError("mineru_api_error", f"Agent API upload 失败: {e.code} - {err_body}")
    except urllib.error.URLError as e:
        raise DocumentExtractionError("mineru_network_error", f"Agent API 网络错误: {e.reason}")

    if result.get("code") != 0:
        raise DocumentExtractionError("mineru_api_error", f"Agent API 错误: {result.get('msg', '未知')}")

    data = result.get("data") or {}
    task_id = data.get("task_id", "")
    if not task_id:
        raise DocumentExtractionError("mineru_api_error", "Agent API 未返回 task_id")
    return task_id


def _agent_api_poll(task_id: str, deadline: float) -> str:
    """轮询 Agent API 直到完成，返回 markdown_url。"""
    while _time.time() < deadline:
        remaining = max(10, deadline - _time.time())
        try:
            req = urllib.request.Request(f"{MINERU_API_BASE}/api/v1/agent/parse/{task_id}")
            with urllib.request.urlopen(req, timeout=remaining) as resp:
                result = json.loads(resp.read().decode("utf-8"))
        except urllib.error.URLError as e:
            log.warning("agent_api poll 错误: %s, 重试中...", e.reason)
            _time.sleep(_MINERU_POLL_INTERVAL)
            continue

        if result.get("code") != 0:
            raise DocumentExtractionError("mineru_api_error",
                                          f"Agent API 轮询错误: {result.get('msg', '未知')}")

        data = result.get("data") or {}
        state = data.get("state", "")
        log.debug("agent_api poll: task_id=%s state=%s", task_id, state)

        if state == "done":
            markdown_url = data.get("markdown_url", "")
            if not markdown_url:
                raise DocumentExtractionError("mineru_api_error", "Agent API 完成但未返回 markdown_url")
            return markdown_url
        elif state == "failed":
            err_msg = data.get("err_msg", "Agent API 解析失败")
            raise DocumentExtractionError("mineru_failed", err_msg)

        _time.sleep(_MINERU_POLL_INTERVAL)

    raise DocumentExtractionError("mineru_timeout", "Agent API 解析超时")


# ──────────────────────────────────────────────
# Precision Extract API（需要 Token）
# ──────────────────────────────────────────────

def _extract_via_precision_api(raw_bytes: bytes, file_name: str, timeout: int, token: str) -> str:
    """Precision Extract API — 需要 Token，优先使用。"""
    deadline = _time.time() + timeout

    # Step 1: 获取签名上传 URL
    log.info("precision_api: getting upload URL for file=%s size=%dKB", file_name, len(raw_bytes) // 1024)
    upload_info = _precision_get_upload_url(file_name, token)
    log.info("precision_api: got upload URL: url_id=%s", upload_info["url_id"])

    # Step 2: 上传文件
    log.info("precision_api: uploading file...")
    _precision_upload_file(upload_info["upload_url"], raw_bytes, deadline)
    log.info("precision_api: file uploaded")

    # Step 3: 创建提取任务
    log.info("precision_api: creating extract task...")
    task_id = _precision_create_task(upload_info["file_url"], file_name, token)
    log.info("precision_api: task created: task_id=%s", task_id)

    # Step 4: 轮询结果
    full_zip_url = _precision_poll_task(task_id, token, deadline)
    log.info("precision_api: result ready, downloading ZIP from %s", full_zip_url)

    # Step 5: 下载 ZIP 并提取 full.md
    return _precision_download_and_extract(full_zip_url, deadline)


def _precision_get_upload_url(file_name: str, token: str) -> dict[str, str]:
    """从 Precision API 获取签名上传 URL。"""
    body = json.dumps({"files": [{"file_name": file_name}]}).encode("utf-8")
    req = urllib.request.Request(
        f"{MINERU_API_BASE}/api/v4/file-urls/batch",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:500]
        raise DocumentExtractionError("mineru_api_error",
                                      f"Precision API 获取上传 URL 失败: {e.code} - {err_body}")
    except urllib.error.URLError as e:
        raise DocumentExtractionError("mineru_network_error", f"Precision API 网络错误: {e.reason}")

    if result.get("code") != 0:
        raise DocumentExtractionError("mineru_api_error", f"Precision API 错误: {result.get('msg', '未知')}")

    data = result.get("data") or []
    if not data:
        raise DocumentExtractionError("mineru_api_error", "Precision API 未返回上传 URL")

    info = typing.cast(dict, data[0])
    return {
        "url_id": info.get("url_id", ""),
        "upload_url": info.get("upload_url", ""),
        "file_url": info.get("file_url", ""),
    }


def _precision_upload_file(upload_url: str, raw_bytes: bytes, deadline: float) -> None:
    """上传文件到签名 URL。"""
    remaining = max(30, deadline - _time.time())
    req = urllib.request.Request(upload_url, data=raw_bytes, method="PUT")
    try:
        with urllib.request.urlopen(req, timeout=remaining):
            pass
    except urllib.error.HTTPError as e:
        raise DocumentExtractionError("mineru_api_error", f"文件上传失败: {e.code}")
    except urllib.error.URLError as e:
        raise DocumentExtractionError("mineru_network_error", f"文件上传网络错误: {e.reason}")


def _precision_create_task(file_url: str, file_name: str, token: str) -> str:
    """创建 Precision 提取任务。"""
    body = json.dumps({
        "url": file_url,
        "file_name": file_name,
        "model_version": "vlm",
        "enable_formula": True,
        "enable_table": True,
        "language": "ch",
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{MINERU_API_BASE}/api/v4/extract/task",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:500]
        raise DocumentExtractionError("mineru_api_error",
                                      f"Precision API 创建任务失败: {e.code} - {err_body}")
    except urllib.error.URLError as e:
        raise DocumentExtractionError("mineru_network_error", f"Precision API 网络错误: {e.reason}")

    if result.get("code") != 0:
        raise DocumentExtractionError("mineru_api_error", f"Precision API 错误: {result.get('msg', '未知')}")

    data = result.get("data") or {}
    task_id = data.get("task_id", "")
    if not task_id:
        raise DocumentExtractionError("mineru_api_error", "Precision API 未返回 task_id")
    return task_id


def _precision_poll_task(task_id: str, token: str, deadline: float) -> str:
    """轮询 Precision API 直到完成，返回 full_zip_url。"""
    while _time.time() < deadline:
        remaining = max(10, deadline - _time.time())
        try:
            req = urllib.request.Request(
                f"{MINERU_API_BASE}/api/v4/extract/task/{task_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            with urllib.request.urlopen(req, timeout=remaining) as resp:
                result = json.loads(resp.read().decode("utf-8"))
        except urllib.error.URLError as e:
            log.warning("precision_api poll 错误: %s, 重试中...", e.reason)
            _time.sleep(_MINERU_POLL_INTERVAL)
            continue

        if result.get("code") != 0:
            raise DocumentExtractionError("mineru_api_error",
                                          f"Precision API 轮询错误: {result.get('msg', '未知')}")

        data = result.get("data") or {}
        state = data.get("state", "")
        log.debug("precision_api poll: task_id=%s state=%s", task_id, state)

        if state == "done":
            zip_url = data.get("full_zip_url", "")
            if not zip_url:
                raise DocumentExtractionError("mineru_api_error", "Precision API 完成但未返回 full_zip_url")
            return zip_url
        elif state in ("failed", "error"):
            err_msg = data.get("err_msg", "Precision API 解析失败")
            raise DocumentExtractionError("mineru_failed", err_msg)

        _time.sleep(_MINERU_POLL_INTERVAL)

    raise DocumentExtractionError("mineru_timeout", "Precision API 解析超时")


def _precision_download_and_extract(zip_url: str, deadline: float) -> str:
    """下载结果 ZIP 并提取 full.md。"""
    remaining = max(60, deadline - _time.time())
    try:
        with urllib.request.urlopen(zip_url, timeout=remaining) as resp:
            zip_data = resp.read()
    except urllib.error.URLError as e:
        raise DocumentExtractionError("mineru_network_error", f"下载结果 ZIP 失败: {e.reason}")

    try:
        with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
            # 优先找 full.md
            if "full.md" in zf.namelist():
                return zf.read("full.md").decode("utf-8")
            # 降级：找任意 .md 文件
            md_files = [n for n in zf.namelist() if n.endswith(".md")]
            if md_files:
                return zf.read(md_files[0]).decode("utf-8")
            raise DocumentExtractionError("mineru_api_error", "ZIP 中未找到 Markdown 文件")
    except zipfile.BadZipFile as exc:
        raise DocumentExtractionError("mineru_api_error", f"结果 ZIP 损坏: {exc}")


def _download_text(url: str, deadline: float) -> str:
    """从 URL 下载文本内容。"""
    remaining = max(30, deadline - _time.time())
    try:
        with urllib.request.urlopen(url, timeout=remaining) as resp:
            return resp.read().decode("utf-8")
    except urllib.error.URLError as e:
        raise DocumentExtractionError("mineru_network_error", f"下载 Markdown 失败: {e.reason}")
