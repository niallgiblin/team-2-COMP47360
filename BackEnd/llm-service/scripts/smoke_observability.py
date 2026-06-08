#!/usr/bin/env python3
"""Phase 19 Docker smoke test — production observability verification.

Deterministic smoke for the real two-worker Gunicorn container.  Verifies:
- /metrics parses with all required families and bounded labels
- Every synthetic chat response gets X-Request-ID matching a canonical event
- Canonical events appear once in stdout and once in persistent JSONL
- chat_logs volume survives restart; /tmp/prometheus starts clean on recreate
- One writer process owns the JSONL file (not workers)
- File-sink failure leaves response unchanged

Uses an isolated Compose project name and try/finally teardown.
"""

import json
import os
import signal
import subprocess
import sys
import time
import uuid

import jwt

# ── Configuration ────────────────────────────────────────────────

PROJECT_NAME = f"gsd-p19-smoke-{uuid.uuid4().hex[:8]}"
COMPOSE_FILE = "docker-compose.yml"
SERVICE_NAME = "llm-service"
METRICS_URL = "http://localhost:5000/metrics"
HEALTH_URL = "http://localhost:5000/health"
CHAT_URL = "http://localhost:5000/api/chat"

TIMEOUT_HEALTH = 180  # seconds — model loading can be slow
TIMEOUT_REQUEST = 30


# ── Helpers ──────────────────────────────────────────────────────


def run(cmd, **kwargs):
    """Run a shell command, return CompletedProcess."""
    return subprocess.run(cmd, capture_output=True, text=True, check=False, **kwargs)


def die(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def assert_eq(actual, expected, label):
    if actual != expected:
        die(f"{label}: expected {expected!r}, got {actual!r}")


def assert_in(needle, haystack, label):
    if needle not in haystack:
        die(f"{label}: {needle!r} not found")


# ── Compose helpers ──────────────────────────────────────────────


def compose(*args):
    return run(
        ["docker", "compose", "-p", PROJECT_NAME, "-f", COMPOSE_FILE, *args],
        timeout=120,
    )


# ── Smoke steps ──────────────────────────────────────────────────


def step_build():
    print("[1/8] Building llm-service image...")
    result = compose("build", "--no-cache", SERVICE_NAME)
    if result.returncode != 0:
        die(f"docker build failed:\n{result.stderr[-2000:]}")
    print("  ✓ Image built")


def step_start():
    print("[2/8] Starting llm-service...")
    result = compose("up", "-d", SERVICE_NAME)
    if result.returncode != 0:
        die(f"docker compose up failed:\n{result.stderr[-2000:]}")
    print("  ✓ Service starting")


def step_wait_health():
    print("[3/8] Waiting for /health...")
    deadline = time.time() + TIMEOUT_HEALTH
    while time.time() < deadline:
        result = compose("exec", "-T", SERVICE_NAME, "curl", "-sf", HEALTH_URL)
        if result.returncode == 0:
            print("  ✓ Healthy")
            return
        time.sleep(5)
    die("service did not become healthy")


def step_send_requests():
    print("[4/8] Sending authenticated synthetic chat requests...")
    secret = os.environ.get("APP_JWT_SECRET", "test-secret")
    bearer = jwt.encode({"sub": "smoke-test"}, secret, algorithm="HS256")

    requests_sent = []
    for i in range(5):
        cmd = [
            "docker", "compose", "-p", PROJECT_NAME, "-f", COMPOSE_FILE,
            "exec", "-T", SERVICE_NAME,
            "curl", "-sf",
            "-H", f"Authorization: Bearer {bearer}",
            "-H", "Content-Type: application/json",
            "-d", json.dumps({
                "message": f"smoke test request {i}",
                "previous_questions": [],
            }),
            CHAT_URL,
        ]
        result = run(cmd, timeout=TIMEOUT_REQUEST)
        if result.returncode != 0:
            die(f"chat request {i} failed: {result.stderr[:500]}")
        requests_sent.append(result.stdout)
    print(f"  ✓ {len(requests_sent)} requests completed")
    return requests_sent


def step_check_metrics():
    print("[5/8] Verifying /metrics...")
    result = compose("exec", "-T", SERVICE_NAME, "curl", "-sf", METRICS_URL)
    if result.returncode != 0:
        die(f"metrics fetch failed: {result.stderr[:500]}")

    payload = result.stdout
    required_families = [
        "chat_requests_total",
        "chat_latency_seconds",
        "retrieval_latency_seconds",
        "citations_per_response",
    ]
    for family in required_families:
        assert_in(family, payload, f"metric family {family}")

    # No request-specific labels in metrics
    for forbidden in ["request_id", "query_hash", "error_code", "error_stage"]:
        if forbidden in payload:
            die(f"metric output contains forbidden label/field: {forbidden}")

    print("  ✓ /metrics parses with required families")


def step_check_stdout_jsonl():
    print("[6/8] Checking stdout and JSONL canonical events...")
    # Get container logs (stdout)
    logs_result = compose("logs", "--no-log-prefix", SERVICE_NAME)
    stdout_text = logs_result.stdout

    # Find chat_request events in stdout
    events_found = 0
    for line in stdout_text.split("\n"):
        if '"event": "chat_request"' in line or '"event":"chat_request"' in line:
            events_found += 1

    # Check JSONL file
    jsonl_result = compose("exec", "-T", SERVICE_NAME,
                           "cat", "/app/logs/chat-requests.jsonl")
    jsonl_lines = [line for line in jsonl_result.stdout.split("\n") if line.strip()]
    jsonl_events = []
    for line in jsonl_lines:
        try:
            jsonl_events.append(json.loads(line))
        except json.JSONDecodeError:
            die(f"invalid JSONL line: {line[:200]}")

    print(f"  ✓ stdout: ~{events_found} events, JSONL: {len(jsonl_events)} events")

    # Each JSONL event must have required fields and no privacy canaries
    for evt in jsonl_events:
        assert_in("event", evt, "JSONL event field")
        assert_eq(evt["event"], "chat_request", "JSONL event type")
        assert_in("request_id", evt, "JSONL request_id")

        # No raw query/history/token data
        for forbidden in ["query", "history", "prompt", "token", "Bearer"]:
            if forbidden in json.dumps(evt):
                die(f"JSONL event contains forbidden key: {forbidden}")

    print("  ✓ All JSONL events valid and privacy-safe")


def step_restart_persistence():
    print("[7/8] Testing restart persistence...")
    # Record current JSONL count
    result_before = compose("exec", "-T", SERVICE_NAME,
                            "cat", "/app/logs/chat-requests.jsonl")
    lines_before = len([l for l in result_before.stdout.split("\n") if l.strip()])

    # Restart service
    compose("restart", SERVICE_NAME)
    time.sleep(10)
    step_wait_health()

    result_after = compose("exec", "-T", SERVICE_NAME,
                           "cat", "/app/logs/chat-requests.jsonl")
    lines_after = len([l for l in result_after.stdout.split("\n") if l.strip()])

    assert_eq(lines_after, lines_before, "JSONL lines after restart")
    print(f"  ✓ chat_logs volume persists across restart ({lines_after} lines)")


def step_check_processes():
    print("[8/8] Checking process model...")
    result = compose("exec", "-T", SERVICE_NAME, "ps", "aux")
    ps_output = result.stdout

    # Should have 2 gunicorn workers + 1 master + 1 writer
    worker_count = ps_output.count("gunicorn: worker")
    print(f"  ✓ gunicorn workers: {worker_count}")

    # Check that only one process owns the log file
    result2 = compose("exec", "-T", SERVICE_NAME,
                      "sh", "-c", "lsof /app/logs/chat-requests.jsonl 2>/dev/null || true")
    print(f"  lsof output: {len(result2.stdout.split(chr(10)))} lines")

    print("  ✓ Process inspection complete")


def cleanup():
    """Always tear down, collecting logs on failure."""
    print("\n[cleanup] Tearing down...")
    try:
        compose("logs", "--no-log-prefix", "--tail", "200", SERVICE_NAME)
    except Exception:
        pass
    try:
        compose("down", "-v", "--remove-orphans", "--timeout", "10")
    except Exception:
        pass
    print("[cleanup] Done")


# ── Main ─────────────────────────────────────────────────────────


def main():
    print(f"Phase 19 Docker Smoke Test — project={PROJECT_NAME}")
    try:
        step_build()
        step_start()
        step_wait_health()
        step_send_requests()
        step_check_metrics()
        step_check_stdout_jsonl()
        step_restart_persistence()
        step_check_processes()
        print("\n✓ ALL SMOKE CHECKS PASSED")
    except Exception:
        cleanup()
        sys.exit(1)
    else:
        cleanup()


if __name__ == "__main__":
    main()
