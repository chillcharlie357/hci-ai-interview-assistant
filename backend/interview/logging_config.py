"""
Shared logging configuration for the entire backend.
Call configure_logging() once at application startup.
"""
from __future__ import annotations

import logging
import sys

_initialized = False


def configure_logging(level: str = "INFO") -> None:
    global _initialized
    if _initialized:
        return
    _initialized = True

    numeric_level = getattr(logging, level.upper(), logging.INFO)
    fmt = logging.Formatter(
        "%(asctime)s [%(levelname)-7s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(fmt)

    root = logging.getLogger()
    root.setLevel(numeric_level)
    # Avoid duplicate handlers (configure_logging is called only once)
    if not root.handlers:
        root.addHandler(handler)
