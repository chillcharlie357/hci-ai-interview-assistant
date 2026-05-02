from __future__ import annotations

import io
import struct
import tempfile
import unittest
import wave
from pathlib import Path

try:
    import numpy as np  # type: ignore

    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

from backend.speech_analysis import analyze_speech
from backend.speech_analysis.types import SpeechAnalysis


@unittest.skipUnless(HAS_NUMPY, "numpy 未安装，跳过语音分析测试")
class SpeechAnalysisTest(unittest.TestCase):
    def test_analyze_synthetic_tone_returns_features(self) -> None:
        sample_rate = 16000
        duration_sec = 2.0
        t = np.arange(int(sample_rate * duration_sec)) / sample_rate
        samples = (0.5 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)

        result = analyze_speech(samples, sample_rate=sample_rate)

        self.assertIsInstance(result, SpeechAnalysis)
        self.assertIn(result.status, {"ok", "partial"})
        self.assertIsNotNone(result.acoustic)
        features = result.acoustic
        assert features is not None
        self.assertAlmostEqual(features.duration_sec, duration_sec, places=1)
        self.assertGreater(features.speech_ratio, 0.8)      # 纯音基本都是有声
        self.assertEqual(features.pause_count, 0)           # 纯音中没有停顿
        self.assertLess(features.rms_db_mean, 0.0)          # dBFS 应为负
        # 任一 F0 后端都应把 220Hz 粗略估出来，允许较宽误差
        if features.f0_mean_hz is not None:
            self.assertLess(abs(features.f0_mean_hz - 220.0), 60.0)

    def test_analyze_silence_produces_warning(self) -> None:
        sample_rate = 16000
        samples = np.zeros(int(sample_rate * 3.0), dtype=np.float32)

        result = analyze_speech(samples, sample_rate=sample_rate)

        self.assertIsNotNone(result.acoustic)
        assert result.acoustic is not None
        self.assertLess(result.acoustic.speech_ratio, 0.1)
        self.assertTrue(any("语音占比过低" in w or "响度过低" in w for w in result.warnings))

    def test_detects_sentence_internal_pauses(self) -> None:
        sample_rate = 16000

        def tone(seconds: float) -> np.ndarray:
            t = np.arange(int(sample_rate * seconds)) / sample_rate
            return (0.4 * np.sin(2 * np.pi * 200 * t)).astype(np.float32)

        def silence(seconds: float) -> np.ndarray:
            return np.zeros(int(sample_rate * seconds), dtype=np.float32)

        # 两段语音之间夹 0.6 秒静音，应当被检测为 1 次停顿
        samples = np.concatenate([tone(0.8), silence(0.6), tone(0.8)])

        result = analyze_speech(samples, sample_rate=sample_rate)

        assert result.acoustic is not None
        self.assertGreaterEqual(result.acoustic.pause_count, 1)
        self.assertGreaterEqual(result.acoustic.longest_pause_sec, 0.4)

    def test_ndarray_requires_sample_rate(self) -> None:
        samples = np.zeros(1000, dtype=np.float32)
        result = analyze_speech(samples)  # 故意不传 sample_rate

        self.assertEqual(result.status, "fallback")
        self.assertTrue(any("missing_sample_rate" in w for w in result.warnings))

    def test_accepts_wav_file(self) -> None:
        sample_rate = 16000
        t = np.arange(int(sample_rate * 1.5)) / sample_rate
        samples = (0.3 * np.sin(2 * np.pi * 180 * t)).astype(np.float32)
        pcm = (samples * 32767.0).astype(np.int16).tobytes()

        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(sample_rate)
            handle.writeframes(pcm)

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(buffer.getvalue())
            tmp_path = Path(tmp.name)

        try:
            result = analyze_speech(tmp_path)
        finally:
            tmp_path.unlink(missing_ok=True)

        self.assertIsNotNone(result.acoustic)
        assert result.acoustic is not None
        self.assertAlmostEqual(result.acoustic.duration_sec, 1.5, places=1)

    def test_invalid_path_returns_fallback(self) -> None:
        result = analyze_speech("/nonexistent/audio.wav")
        self.assertEqual(result.status, "fallback")
        self.assertIsNone(result.acoustic)
        self.assertTrue(any("audio_not_found" in w for w in result.warnings))


if __name__ == "__main__":
    unittest.main()
