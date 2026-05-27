"""Bounded TTL search cache and stable cache-key helpers."""

import hashlib
import threading
import time
from collections import OrderedDict


def generate_cache_key(vibe_desc, max_results, location_filter=None, price_range=None):
    """Generate a unique cache key for search parameters."""
    key_parts = [
        vibe_desc.lower().strip(),
        str(max_results),
        str(location_filter).lower().strip() if location_filter else "",
        str(price_range).lower().strip() if price_range else "",
    ]
    key_string = "|".join(key_parts)
    return hashlib.md5(key_string.encode()).hexdigest()


class BoundedTTLCache:
    def __init__(self, max_entries, ttl_seconds, now_func=time.time):
        self.max_entries = max_entries
        self.ttl_seconds = ttl_seconds
        self.now_func = now_func
        self._items = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            self._cleanup_expired()
            item = self._items.get(key)
            if item is None:
                return None
            timestamp, value = item
            if self.now_func() - timestamp >= self.ttl_seconds:
                self._items.pop(key, None)
                return None
            self._items.move_to_end(key)
            return value

    def set(self, key, value):
        with self._lock:
            self._cleanup_expired()
            self._items[key] = (self.now_func(), value)
            self._items.move_to_end(key)
            while len(self._items) > self.max_entries:
                self._items.popitem(last=False)

    def clear(self):
        with self._lock:
            self._items.clear()

    def _cleanup_expired(self):
        now = self.now_func()
        expired = [
            key
            for key, (timestamp, _value) in self._items.items()
            if now - timestamp >= self.ttl_seconds
        ]
        for key in expired:
            self._items.pop(key, None)
