"""Wave 0 red tests for planned cache_policy.py bounded TTL cache."""

import threading

import pytest

from cache_policy import BoundedTTLCache, generate_cache_key


def test_generate_cache_key_normalizes_inputs():
    key_a = generate_cache_key("  Jazz Bars ", 10, " Downtown ", " Mid ")
    key_b = generate_cache_key("jazz bars", 10, "downtown", "mid")
    key_c = generate_cache_key("jazz bars", 10, None, None)

    assert key_a == key_b
    assert key_a != key_c


def test_bounded_ttl_cache_enforces_max_entries_without_sleeping():
    now = {"value": 0.0}
    cache = BoundedTTLCache(max_entries=2, ttl_seconds=60, now_func=lambda: now["value"])

    cache.set("a", {"results": [1]})
    cache.set("b", {"results": [2]})
    cache.set("c", {"results": [3]})

    assert cache.get("a") is None
    assert cache.get("b") == {"results": [2]}
    assert cache.get("c") == {"results": [3]}


def test_bounded_ttl_cache_expires_entries_with_injected_clock():
    now = {"value": 0.0}
    cache = BoundedTTLCache(max_entries=10, ttl_seconds=5, now_func=lambda: now["value"])

    cache.set("fresh", "value")
    now["value"] = 6.0

    assert cache.get("fresh") is None


def test_bounded_ttl_cache_is_thread_safe():
    now = {"value": 0.0}
    cache = BoundedTTLCache(max_entries=100, ttl_seconds=60, now_func=lambda: now["value"])
    errors = []

    def worker(offset):
        try:
            for index in range(20):
                cache.set(f"{offset}-{index}", index)
                cache.get(f"{offset}-{index}")
        except Exception as exc:  # pragma: no cover - test guard
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(offset,)) for offset in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []


def test_cache_policy_exposes_max_entries_setting():
    cache = BoundedTTLCache(max_entries=512, ttl_seconds=300)
    assert cache.max_entries == 512
