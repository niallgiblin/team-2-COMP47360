package com.manhattan.busyness_predictor.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class RateLimitService {

    private final int capacity;
    private final long refillSeconds;
    private final int maxBuckets;
    private final Clock clock;
    private final Map<String, BucketState> buckets = new HashMap<>();

    public RateLimitService(
            @Value("${app.rate-limit.expensive.capacity:30}") int capacity,
            @Value("${app.rate-limit.expensive.refill-seconds:60}") long refillSeconds,
            @Value("${app.rate-limit.expensive.max-buckets:10000}") int maxBuckets) {
        this(capacity, refillSeconds, maxBuckets, Clock.systemUTC());
    }

    RateLimitService(int capacity, long refillSeconds, int maxBuckets, Clock clock) {
        this.capacity = Math.max(1, capacity);
        this.refillSeconds = Math.max(1, refillSeconds);
        this.maxBuckets = Math.max(1, maxBuckets);
        this.clock = clock;
    }

    public synchronized RateLimitResult consume(String key) {
        evictIfNeeded();
        BucketState bucket = buckets.computeIfAbsent(key, ignored -> new BucketState(capacity, Instant.now(clock)));
        refill(bucket);
        bucket.lastSeen = Instant.now(clock);

        if (bucket.tokens > 0) {
            bucket.tokens--;
            return RateLimitResult.allowed(bucket.tokens);
        }

        return RateLimitResult.denied(retryAfterSeconds(bucket));
    }

    public synchronized int bucketCount() {
        return buckets.size();
    }

    private void refill(BucketState bucket) {
        Instant now = Instant.now(clock);
        long elapsedSeconds = Duration.between(bucket.lastRefill, now).getSeconds();
        if (elapsedSeconds < refillSeconds) {
            return;
        }
        long refills = elapsedSeconds / refillSeconds;
        bucket.tokens = (int) Math.min(capacity, bucket.tokens + (refills * capacity));
        bucket.lastRefill = bucket.lastRefill.plusSeconds(refills * refillSeconds);
    }

    private long retryAfterSeconds(BucketState bucket) {
        long elapsed = Duration.between(bucket.lastRefill, Instant.now(clock)).getSeconds();
        return Math.max(1, refillSeconds - elapsed);
    }

    private void evictIfNeeded() {
        while (buckets.size() >= maxBuckets) {
            String oldestKey = buckets.entrySet().stream()
                    .min(Comparator.comparing(entry -> entry.getValue().lastSeen))
                    .map(Map.Entry::getKey)
                    .orElse(null);
            if (oldestKey != null) {
                buckets.remove(oldestKey);
            } else {
                break;
            }
        }
    }

    private static final class BucketState {
        private int tokens;
        private Instant lastRefill;
        private Instant lastSeen;

        private BucketState(int tokens, Instant now) {
            this.tokens = tokens;
            this.lastRefill = now;
            this.lastSeen = now;
        }
    }

    public static final class RateLimitResult {
        private final boolean allowed;
        private final long retryAfterSeconds;
        private final long remainingTokens;

        private RateLimitResult(boolean allowed, long retryAfterSeconds, long remainingTokens) {
            this.allowed = allowed;
            this.retryAfterSeconds = retryAfterSeconds;
            this.remainingTokens = remainingTokens;
        }

        public static RateLimitResult allowed(long remainingTokens) {
            return new RateLimitResult(true, 0, remainingTokens);
        }

        public static RateLimitResult denied(long retryAfterSeconds) {
            return new RateLimitResult(false, retryAfterSeconds, 0);
        }

        public boolean isAllowed() {
            return allowed;
        }

        public long getRetryAfterSeconds() {
            return retryAfterSeconds;
        }

        public long getRemainingTokens() {
            return remainingTokens;
        }

        @Override
        public String toString() {
            return "RateLimitResult{"
                    + "allowed=" + allowed
                    + ", Retry-After=" + retryAfterSeconds
                    + ", remainingTokens=" + remainingTokens
                    + '}';
        }
    }
}
