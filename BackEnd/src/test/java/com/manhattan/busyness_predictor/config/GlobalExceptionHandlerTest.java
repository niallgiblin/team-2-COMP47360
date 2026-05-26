package com.manhattan.busyness_predictor.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.manhattan.busyness_predictor.dto.ApiErrorResponse;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class GlobalExceptionHandlerTest {

    private static final String SENTINEL = "secret-stacktrace-sentinel-must-not-leak";

    @Test
    void unexpectedExceptionUsesSafeEnvelopeWithoutRawMessage() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();

        ResponseEntity<ApiErrorResponse> response = handler.handleGlobalException(
                new RuntimeException(SENTINEL + " java.lang.IllegalStateException /tmp/private"),
                null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getError()).isEqualTo("Internal server error");
        assertThat(response.getBody().getMessage()).isEqualTo("An unexpected error occurred");
        assertThat(response.getBody().getMessage()).doesNotContain(SENTINEL);
        assertThat(response.getBody().getStatus()).isEqualTo(500);
        assertThat(response.getBody().getCode()).isEqualTo("INTERNAL_ERROR");
    }
}
