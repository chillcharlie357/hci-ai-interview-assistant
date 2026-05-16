"""Tests for logging configuration — verifies log format, level control, and deduplication."""

from __future__ import annotations

import io
import logging
import unittest

from backend.interview.logging_config import configure_logging


class LoggingConfigTest(unittest.TestCase):
    def setUp(self):
        # Reset logging state for each test
        root = logging.getLogger()
        for handler in list(root.handlers):
            root.removeHandler(handler)
            handler.close()
        root.setLevel(logging.WARNING)  # default high so tests can verify level changes
        # Reset the configure_logging module state
        import backend.interview.logging_config as lc
        lc._initialized = False

    def tearDown(self):
        # Clean up handlers added by tests
        root = logging.getLogger()
        for handler in list(root.handlers):
            root.removeHandler(handler)
            handler.close()
        import backend.interview.logging_config as lc
        lc._initialized = False

    def test_configure_logging_adds_single_handler(self):
        configure_logging()
        root = logging.getLogger()
        self.assertEqual(len(root.handlers), 1)

    def test_configure_logging_deduplication(self):
        configure_logging()
        configure_logging()  # second call should be no-op
        root = logging.getLogger()
        self.assertEqual(len(root.handlers), 1)

    def test_configure_logging_sets_correct_level(self):
        configure_logging(level="DEBUG")
        root = logging.getLogger()
        self.assertEqual(root.level, logging.DEBUG)

    def test_configure_logging_default_level_is_info(self):
        configure_logging()
        root = logging.getLogger()
        self.assertEqual(root.level, logging.INFO)

    def test_configure_logging_invalid_level_falls_back_to_info(self):
        configure_logging(level="INVALID_LEVEL")
        root = logging.getLogger()
        self.assertEqual(root.level, logging.INFO)

    def test_log_format_includes_timestamp_level_and_name(self):
        configure_logging()
        stream = io.StringIO()
        root = logging.getLogger()
        # Replace the handler's stream so we can capture output
        root.handlers[0].setStream(stream)

        test_logger = logging.getLogger("backend.test")
        test_logger.info("hello world")

        output = stream.getvalue()
        self.assertIn("[INFO", output)
        self.assertIn("[backend.test]", output)
        self.assertIn("hello world", output)
        self.assertRegex(output, r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}")  # timestamp

    def test_debug_messages_suppressed_at_info_level(self):
        configure_logging(level="INFO")
        stream = io.StringIO()
        root = logging.getLogger()
        root.handlers[0].setStream(stream)

        test_logger = logging.getLogger("backend.test")
        test_logger.debug("debug message")
        test_logger.info("info message")

        output = stream.getvalue()
        self.assertNotIn("debug message", output)
        self.assertIn("info message", output)

    def test_warning_and_error_emitted_at_warn_level(self):
        configure_logging(level="WARNING")
        stream = io.StringIO()
        root = logging.getLogger()
        root.handlers[0].setStream(stream)

        test_logger = logging.getLogger("backend.test")
        test_logger.info("should not appear")
        test_logger.warning("warning appears")
        test_logger.error("error appears")

        output = stream.getvalue()
        self.assertNotIn("should not appear", output)
        self.assertIn("warning appears", output)
        self.assertIn("error appears", output)

    def test_db_logger_name_is_backend_db(self):
        db_logger = logging.getLogger("backend.db")
        self.assertEqual(db_logger.name, "backend.db")

    def test_http_logger_name_is_backend_http(self):
        http_logger = logging.getLogger("backend.http")
        self.assertEqual(http_logger.name, "backend.http")


if __name__ == "__main__":
    unittest.main()
