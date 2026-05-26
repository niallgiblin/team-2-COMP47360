package com.manhattan.busyness_predictor.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

import com.manhattan.busyness_predictor.security.RateLimitService.RateLimitResult;

class RateLimitServiceTest {

    @Test
    void allowsRequestsUntilCapacityIsConsumed() {
        RateLimitService service = new RateLimitService(2, 60, 100, fixedClock());

        RateLimitResult first = service.consume("user:1:vibe-search");
        RateLimitResult second = service.consume("user:1:vibe-search");

        assertThat(first.isAllowed()).isTrue();
        assertThat(first.getRemainingTokens()).isEqualTo(1);
        assertThat(second.isAllowed()).isTrue();
        assertThat(second.getRemainingTokens()).isEqualTo(0);
    }

    @Test
    void deniesOverQuotaWithRetryAfterMetadata() {
        RateLimitService service = new RateLimitService(1, 60, 100, fixedClock());

        service.consume("ip:127.0.0.1:vibe-search");
        RateLimitResult denied = service.consume("ip:127.0.0.1:vibe-search");

        assertThat(denied.isAllowed()).isFalse();
        assertThat(denied.getRetryAfterSeconds()).isEqualTo(60);
        assertThat(denied.toString()).contains("Retry-After");
    }

    @Test
    void evictsOldestBucketWhenRegistryReachesBound() {
        RateLimitService service = new RateLimitService(1, 60, 2, fixedClock());

        service.consume("user:1:vibe-search");
        service.consume("user:2:vibe-search");
        service.consume("user:3:vibe-search");

        assertThat(service.bucketCount()).isEqualTo(2);
    }

    private Clock fixedClock() {
        return Clock.fixed(Instant.parse("2026-05-26T12:00:00Z"), ZoneOffset.UTC);
    }
}
