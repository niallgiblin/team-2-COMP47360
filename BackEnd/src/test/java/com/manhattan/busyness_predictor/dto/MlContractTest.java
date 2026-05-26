package com.manhattan.busyness_predictor.dto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;

class MlContractTest {

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
    }

    @Test
    void deserializesSearchFixtureWithRequiredFields() throws Exception {
        MlSearchResponse response = loadFixture(
                "contract-fixtures/llm/search-success.json",
                MlSearchResponse.class);

        assertTrue(response.isSuccess());
        assertNotNull(response.getResults());
        assertFalse(response.getResults().isEmpty());
        assertEquals("jazz bars", response.getQuery());
        assertNotNull(response.getConfidence());

        MlLocationDto first = response.getResults().get(0);
        assertNotNull(first.getId());
        assertNotNull(first.getName());
        assertNotNull(first.getAddress());
        assertNotNull(first.getLatitude());
        assertNotNull(first.getLongitude());
        assertNotNull(first.getType());
        assertNotNull(first.getSimilarity());
    }

    @Test
    void deserializesSimilarFixtureWithSimilarityScore() throws Exception {
        MlSearchResponse response = loadFixture(
                "contract-fixtures/llm/similar-success.json",
                MlSearchResponse.class);

        assertNotNull(response.getResults());
        assertFalse(response.getResults().isEmpty());
        assertNotNull(response.getResults().get(0).getSimilarity());
    }

    @Test
    void deserializesBusynessFixtureWithNumericPredictions() throws Exception {
        BusynessReportDto report = loadFixture(
                "contract-fixtures/busyness/report-minimal.json",
                BusynessReportDto.class);

        assertTrue(report.isSuccess());
        assertNotNull(report.getPredictions());
        assertTrue(report.getPredictions().size() >= 2);
        report.getPredictions().values().forEach(value ->
                assertTrue(value instanceof Double || value instanceof Number));
    }

    @Test
    void ignoresUnknownFlaskFieldsDuringDeserialization() throws Exception {
        String json = """
                {
                  "success": true,
                  "query": "test",
                  "results": [],
                  "confidence": 0.5,
                  "extraFlaskField": "ignored"
                }
                """;

        MlSearchResponse response = objectMapper.readValue(json, MlSearchResponse.class);

        assertTrue(response.isSuccess());
        assertEquals("test", response.getQuery());
    }

    @Test
    void mapSearchFixtureToLocationEntity() throws Exception {
        MlSearchResponse response = loadFixture(
                "contract-fixtures/llm/search-success.json",
                MlSearchResponse.class);

        // RED until Wave 2/5 implements MlResponseMapper.toLocations(MlSearchResponse)
        fail("MlResponseMapper.toLocations not implemented until Wave 2");
    }

    private <T> T loadFixture(String classpathResource, Class<T> type) throws Exception {
        InputStream stream = getClass().getClassLoader().getResourceAsStream(classpathResource);
        assertNotNull(stream, "Fixture not found on classpath: " + classpathResource);
        String json = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        return objectMapper.readValue(json, type);
    }
}
