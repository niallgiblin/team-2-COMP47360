"""Gunicorn configuration for Phase 19 observability.

Single source of truth for workers, bind, timeout, and process lifecycle
hooks (writer start/stop, Prometheus dead-worker marking).

The app is preloaded so workers share the multiprocessing.Queue and
sentence-transformer model.
"""

import os

# ── Server settings ──────────────────────────────────────────────
bind = "0.0.0.0:5000"
workers = 2
preload_app = True
timeout = 120

# ── Process naming ───────────────────────────────────────────────
proc_name = "llm-service"


# ── Lifecycle hooks ──────────────────────────────────────────────

def on_starting(server):
    """Start the single JSONL writer process in the Gunicorn master."""
    import logging
    logger = logging.getLogger(__name__)
    try:
        from observability import _start_writer
        _start_writer()
        logger.info("observability writer started via gunicorn on_starting")
    except Exception:
        logger.warning("observability writer start failed", exc_info=True)


def child_exit(server, worker):
    """Mark worker PID dead in Prometheus multiprocess files."""
    import logging
    logger = logging.getLogger(__name__)
    try:
        from prometheus_client import multiprocess
        multiprocess.mark_process_dead(worker.pid)
        logger.debug("marked worker %d as dead in prometheus multiprocess", worker.pid)
    except Exception:
        logger.warning("failed to mark worker %d as dead", worker.pid, exc_info=True)


def on_exit(server):
    """Gracefully stop the writer process."""
    import logging
    logger = logging.getLogger(__name__)
    try:
        from observability import _stop_writer
        _stop_writer()
        logger.info("observability writer stopped via gunicorn on_exit")
    except Exception:
        logger.warning("observability writer stop failed", exc_info=True)
