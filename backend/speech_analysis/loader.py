from __future__ import annotations

import aifc
import io
import shutil
import struct
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import TYPE_CHECKING

from backend.speech_analysis.types import SpeechAnalysisError

if TYPE_CHECKING:
    import numpy as np


SUPPORTED_SUFFIXES = {
    ".wav",
    ".mp3",
    ".webm",
    ".m4a",
    ".ogg",
    ".flac",
    ".aiff",
    ".aif",
    ".aifc",
}


def load_audio(
    source: "str | Path | bytes",
    *,
    target_sample_rate: int | None = 16000,
) -> "tuple[np.ndarray, int]":
    """把任意受支持格式的音频读成 mono float32 信号。

    - source 可以是文件路径或原始字节。
    - 如果传入 bytes，必须同时知道格式，这里通过魔数粗略嗅探；嗅探不出时按 wav 处理。
    - target_sample_rate 不为 None 时会做线性重采样（避免引入 scipy）。
    """

    numpy = _require_numpy()

    raw_bytes, suffix_hint = _read_bytes_and_hint(source)
    samples, sample_rate = _decode_bytes(raw_bytes, suffix_hint)

    if samples.ndim > 1:
        samples = samples.mean(axis=1)

    samples = samples.astype(numpy.float32, copy=False)
    peak = float(numpy.max(numpy.abs(samples))) if samples.size else 0.0
    if peak > 1.0:
        samples = samples / peak  # 规整到 [-1, 1]

    if target_sample_rate and sample_rate != target_sample_rate:
        samples = _linear_resample(samples, sample_rate, target_sample_rate)
        sample_rate = target_sample_rate

    return samples, sample_rate


# -------------------- 内部实现 --------------------


def _read_bytes_and_hint(source: "str | Path | bytes") -> tuple[bytes, str]:
    if isinstance(source, (str, Path)):
        path = Path(source)
        if not path.exists():
            raise SpeechAnalysisError("audio_not_found", f"音频文件不存在：{path}")
        suffix = path.suffix.lower()
        if suffix and suffix not in SUPPORTED_SUFFIXES:
            raise SpeechAnalysisError(
                "unsupported_audio_format",
                f"暂不支持的音频格式：{suffix}；支持 {sorted(SUPPORTED_SUFFIXES)}",
            )
        return path.read_bytes(), suffix or _sniff_suffix(path.read_bytes()[:16])

    if isinstance(source, (bytes, bytearray)):
        data = bytes(source)
        if not data:
            raise SpeechAnalysisError("empty_audio_payload", "音频字节为空。")
        return data, _sniff_suffix(data[:16])

    raise SpeechAnalysisError("invalid_audio_source", "audio 必须是路径或 bytes。")


def _sniff_suffix(head: bytes) -> str:
    if head.startswith(b"RIFF") and b"WAVE" in head[:16]:
        return ".wav"
    if head.startswith(b"ID3") or head[:2] in {b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"}:
        return ".mp3"
    if head.startswith(b"\x1a\x45\xdf\xa3"):
        # EBML 头，webm / matroska 都用这个
        return ".webm"
    if head.startswith(b"OggS"):
        return ".ogg"
    if head.startswith(b"fLaC"):
        return ".flac"
    if head[4:8] == b"ftyp":
        return ".m4a"
    if head.startswith(b"FORM") and head[8:12] in {b"AIFF", b"AIFC"}:
        return ".aiff"
    return ".wav"  # 兜底，交给解码器自行报错


def _decode_bytes(raw: bytes, suffix: str) -> "tuple[np.ndarray, int]":
    # 1. 纯 WAV 用标准库，零依赖
    if suffix == ".wav":
        try:
            return _decode_wav_stdlib(raw)
        except Exception:
            pass  # 异常的 WAV 交给下面的后端再试

    # 2. AIFF/AIFC 用标准库 aifc，同样零依赖
    if suffix in {".aiff", ".aif", ".aifc"}:
        try:
            return _decode_aiff_stdlib(raw)
        except Exception:
            pass  # 异常/压缩格式交给 soundfile / ffmpeg

    # 3. soundfile：支持 flac/ogg/aiff/部分 mp3（需要 libsndfile ≥ 1.1）
    decoded = _try_soundfile(raw)
    if decoded is not None:
        return decoded

    # 4. ffmpeg CLI fallback：几乎能解一切（包含 mp3 / webm / m4a / aiff 压缩变体）
    decoded = _try_ffmpeg(raw, suffix)
    if decoded is not None:
        return decoded

    raise SpeechAnalysisError(
        "audio_decode_failed",
        "无法解码该音频。请安装 soundfile（支持 flac/ogg/aiff），或在系统中安装 ffmpeg 以支持 mp3/webm/m4a。",
    )


def _decode_wav_stdlib(raw: bytes) -> "tuple[np.ndarray, int]":
    numpy = _require_numpy()
    with wave.open(io.BytesIO(raw), "rb") as handle:
        channels = handle.getnchannels()
        sample_width = handle.getsampwidth()
        sample_rate = handle.getframerate()
        frame_count = handle.getnframes()
        pcm = handle.readframes(frame_count)

    if sample_width == 2:
        samples = numpy.frombuffer(pcm, dtype=numpy.int16).astype(numpy.float32) / 32768.0
    elif sample_width == 4:
        samples = numpy.frombuffer(pcm, dtype=numpy.int32).astype(numpy.float32) / 2147483648.0
    elif sample_width == 1:
        samples = (numpy.frombuffer(pcm, dtype=numpy.uint8).astype(numpy.float32) - 128.0) / 128.0
    elif sample_width == 3:
        samples = _decode_24bit_pcm(pcm)
    else:
        raise SpeechAnalysisError("unsupported_wav_width", f"不支持的 WAV 位宽：{sample_width * 8} bit")

    if channels > 1:
        samples = samples.reshape(-1, channels)
    return samples, sample_rate


def _decode_24bit_pcm(pcm: bytes) -> "np.ndarray":
    numpy = _require_numpy()
    count = len(pcm) // 3
    values = numpy.empty(count, dtype=numpy.int32)
    for index in range(count):
        chunk = pcm[index * 3 : index * 3 + 3]
        value = struct.unpack("<i", chunk + (b"\xff" if chunk[2] & 0x80 else b"\x00"))[0]
        values[index] = value
    return values.astype(numpy.float32) / (2 ** 23)


def _decode_aiff_stdlib(raw: bytes) -> "tuple[np.ndarray, int]":
    """用 aifc 解 AIFF / AIFF-C（uncompressed PCM）。压缩编码会抛异常，交给上层 fallback。"""
    numpy = _require_numpy()
    with aifc.open(io.BytesIO(raw), "rb") as handle:
        channels = handle.getnchannels()
        sample_width = handle.getsampwidth()
        sample_rate = handle.getframerate()
        frame_count = handle.getnframes()
        pcm = handle.readframes(frame_count)
        comp_type = handle.getcomptype()

    if comp_type not in (b"NONE", b"none", b"sowt"):
        raise SpeechAnalysisError(
            "unsupported_aiff_compression",
            f"AIFF 使用了压缩编码 {comp_type!r}，标准库解不了，回退到 soundfile/ffmpeg。",
        )

    # AIFF 默认 big-endian；sowt 是 little-endian 变体（Mac 里常见）
    big_endian = comp_type != b"sowt"
    if sample_width == 2:
        dtype = numpy.dtype(">i2" if big_endian else "<i2")
        samples = numpy.frombuffer(pcm, dtype=dtype).astype(numpy.float32) / 32768.0
    elif sample_width == 4:
        dtype = numpy.dtype(">i4" if big_endian else "<i4")
        samples = numpy.frombuffer(pcm, dtype=dtype).astype(numpy.float32) / 2147483648.0
    elif sample_width == 1:
        # AIFF 的 8-bit 是 signed
        samples = numpy.frombuffer(pcm, dtype=numpy.int8).astype(numpy.float32) / 128.0
    elif sample_width == 3:
        samples = _decode_aiff_24bit(pcm, big_endian=big_endian)
    else:
        raise SpeechAnalysisError(
            "unsupported_aiff_width", f"不支持的 AIFF 位宽：{sample_width * 8} bit"
        )

    if channels > 1:
        samples = samples.reshape(-1, channels)
    return samples, sample_rate


def _decode_aiff_24bit(pcm: bytes, *, big_endian: bool) -> "np.ndarray":
    numpy = _require_numpy()
    count = len(pcm) // 3
    values = numpy.empty(count, dtype=numpy.int32)
    for index in range(count):
        chunk = pcm[index * 3 : index * 3 + 3]
        if big_endian:
            # 补符号扩展到 32 位
            sign_byte = b"\xff" if chunk[0] & 0x80 else b"\x00"
            value = struct.unpack(">i", sign_byte + chunk)[0]
        else:
            sign_byte = b"\xff" if chunk[2] & 0x80 else b"\x00"
            value = struct.unpack("<i", chunk + sign_byte)[0]
        values[index] = value
    return values.astype(numpy.float32) / (2 ** 23)


def _try_soundfile(raw: bytes) -> "tuple[np.ndarray, int] | None":
    try:
        import soundfile  # type: ignore
    except Exception:
        return None
    try:
        samples, sample_rate = soundfile.read(io.BytesIO(raw), dtype="float32", always_2d=False)
        return samples, int(sample_rate)
    except Exception:
        return None


def _try_ffmpeg(raw: bytes, suffix: str) -> "tuple[np.ndarray, int] | None":
    if shutil.which("ffmpeg") is None:
        return None
    suffix = suffix if suffix else ".bin"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        handle.write(raw)
        input_path = handle.name
    output_path = input_path + ".wav"
    try:
        proc = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                input_path,
                "-f",
                "wav",
                "-acodec",
                "pcm_s16le",
                "-ac",
                "1",
                "-ar",
                "16000",
                output_path,
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if proc.returncode != 0:
            return None
        return _decode_wav_stdlib(Path(output_path).read_bytes())
    except subprocess.TimeoutExpired:
        return None
    finally:
        Path(input_path).unlink(missing_ok=True)
        Path(output_path).unlink(missing_ok=True)


def _linear_resample(samples: "np.ndarray", src_rate: int, dst_rate: int) -> "np.ndarray":
    numpy = _require_numpy()
    if src_rate == dst_rate or samples.size == 0:
        return samples
    duration = samples.shape[0] / float(src_rate)
    new_length = max(1, int(round(duration * dst_rate)))
    old_index = numpy.linspace(0, samples.shape[0] - 1, num=new_length, dtype=numpy.float64)
    left = numpy.floor(old_index).astype(numpy.int64)
    right = numpy.clip(left + 1, 0, samples.shape[0] - 1)
    frac = (old_index - left).astype(numpy.float32)
    return (samples[left] * (1.0 - frac) + samples[right] * frac).astype(numpy.float32)


def _require_numpy():
    try:
        import numpy
    except ImportError as exc:
        raise SpeechAnalysisError(
            "numpy_not_installed",
            "语音分析需要 numpy，请执行 `uv add numpy` 或 `pip install numpy`。",
        ) from exc
    return numpy
