package com.manhattan.busyness_predictor.dto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.service.MlResponseMapper;

class MlContractTest {

    private ObjectMapper objectMapper;
    private MlResponseMapper mapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        mapper = new MlResponseMapper();
    }

    @Test
    void deserializeSearchSuccessFixture() throws Exception {
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
    void deserializeSearchEmptyFixture() throws Exception {
        MlSearchResponse response = loadFixture(
                "contract-fixtures/llm/search-empty.json",
                MlSearchResponse.class);

        assertTrue(response.isSuccess());
        assertEquals("none", response.getQuery());
        assertNotNull(response.getResults());
        assertTrue(response.getResults().isEmpty());
        assertEquals(0.0, response.getConfidence());
    }

    @Test
    void deserializeSimilarSuccessFixture() throws Exception {
        MlSearchResponse response = loadFixture(
                "contract-fixtures/llm/similar-success.json",
                MlSearchResponse.class);

        assertNotNull(response.getResults());
        assertFalse(response.getResults().isEmpty());
        assertNotNull(response.getResults().get(0).getSimilarity());
    }

    @Test
    void deserializeBusynessMinimalFixture() throws Exception {
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
    void ignoreUnknownFlaskFields() throws Exception {
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
    void mapSearchFixtureToLocations() throws Exception {
        MlSearchResponse response = loadFixture(
                "contract-fixtures/llm/search-success.json",
                MlSearchResponse.class);

        List<Location> locations = mapper.toLocations(response);

        assertEquals(2, locations.size());
        Location first = locations.get(0);
        assertEquals(1, first.getId());
        assertEquals("Blue Note Jazz Club", first.getName());
        assertNotNull(first.getAddress());
        assertNotNull(first.getLat());
        assertNotNull(first.getLng());
        assertEquals(0.91, first.getSimilarity());
        assertTrue(first.getIsBar());
    }

    @Test
    void mapBusynessFixtureToPredictionsAndForecast() throws Exception {
        BusynessReportDto report = loadFixture(
                "contract-fixtures/busyness/report-minimal.json",
                BusynessReportDto.class);

        Map<String, Double> predictions = mapper.toPredictions(report);
        assertEquals(2, predictions.size());
        assertEquals(0.72, predictions.get("zone-1"));
        assertFalse(mapper.toForecast(report).isEmpty());
    }

    @Test
    void toPredictionsReturnsEmptyForNullDto() {
        assertTrue(mapper.toPredictions(null).isEmpty());
    }

    @Test
    void busynessParseFailureReturnsEmptyPredictions() throws Exception {
        BusynessReportDto missingPredictions = objectMapper.readValue(
                """
                {
                  "success": true,
                  "predictions": null,
                  "forecast": []
                }
                """,
                BusynessReportDto.class);

        assertTrue(mapper.toPredictions(missingPredictions).isEmpty());
        assertTrue(mapper.toForecast(missingPredictions).isEmpty());

        BusynessReportDto malformedEnvelope = new BusynessReportDto();
        malformedEnvelope.setSuccess(true);
        assertTrue(mapper.toPredictions(malformedEnvelope).isEmpty());
    }

    private <T> T loadFixture(String classpathResource, Class<T> type) throws Exception {
        InputStream stream = getClass().getClassLoader().getResourceAsStream(classpathResource);
        assertNotNull(stream, "Fixture not found on classpath: " + classpathResource);
        String json = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        return objectMapper.readValue(json, type);
    }
}
