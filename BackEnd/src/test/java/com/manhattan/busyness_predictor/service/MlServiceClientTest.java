package com.manhattan.busyness_predictor.service;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.manhattan.busyness_predictor.dto.BusynessReportDto;
import com.manhattan.busyness_predictor.dto.MlSearchResponse;

@ExtendWith(MockitoExtension.class)
class MlServiceClientTest {

    @Mock
    private RestTemplate restTemplate;

    @InjectMocks
    private MlServiceClient mlServiceClient;

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        ReflectionTestUtils.setField(mlServiceClient, "llmServiceUrl", "http://llm-service:5000");
        ReflectionTestUtils.setField(mlServiceClient, "busynessServiceUrl", "http://busyness-service:5000");
    }

    @Test
    void search_postsToCorrectUrlAndDeserializesFixture() throws Exception {
        MlSearchResponse fixture = loadFixture("contract-fixtures/llm/search-success.json", MlSearchResponse.class);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<HttpEntity<Map<String, Object>>> entityCaptor = ArgumentCaptor.forClass(HttpEntity.class);

        when(restTemplate.exchange(
                eq("http://llm-service:5000/search"),
                eq(HttpMethod.POST),
                entityCaptor.capture(),
                eq(MlSearchResponse.class)))
                .thenReturn(ResponseEntity.ok(fixture));

        MlSearchResponse result = mlServiceClient.search("jazz bars", 10, "Downtown", "mid");

        assertNotNull(result);
        assertEquals(2, result.getResults().size());
        assertEquals("Blue Note Jazz Club", result.getResults().get(0).getName());
        Map<String, Object> body = entityCaptor.getValue().getBody();
        assertNotNull(body);
        assertEquals("jazz bars", body.get("vibeDescription"));
        assertEquals(10, body.get("maxResults"));
        assertEquals("Downtown", body.get("location"));
        assertEquals("mid", body.get("priceRange"));

        verify(restTemplate).exchange(
                eq("http://llm-service:5000/search"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(MlSearchResponse.class));
    }

    @Test
    void findSimilar_postsVenuePayloadToSimilarUrl() throws Exception {
        MlSearchResponse fixture = loadFixture("contract-fixtures/llm/similar-success.json", MlSearchResponse.class);

        Map<String, Object> venuePayload = new LinkedHashMap<>();
        venuePayload.put("name", "Blue Note Jazz Club");
        venuePayload.put("zone", "Greenwich Village");
        venuePayload.put("limit", 5);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<HttpEntity<Map<String, Object>>> entityCaptor = ArgumentCaptor.forClass(HttpEntity.class);

        when(restTemplate.exchange(
                eq("http://llm-service:5000/similar"),
                eq(HttpMethod.POST),
                entityCaptor.capture(),
                eq(MlSearchResponse.class)))
                .thenReturn(ResponseEntity.ok(fixture));

        MlSearchResponse result = mlServiceClient.findSimilar(venuePayload);

        assertNotNull(result);
        assertTrue(result.getResults().size() >= 1);

        Map<String, Object> body = entityCaptor.getValue().getBody();
        assertNotNull(body);
        assertEquals("Blue Note Jazz Club", body.get("name"));

        verify(restTemplate).exchange(
                eq("http://llm-service:5000/similar"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(MlSearchResponse.class));
    }

    @Test
    void fetchBusynessReport_getsBusynessUrl() throws Exception {
        BusynessReportDto fixture = loadFixture(
                "contract-fixtures/busyness/report-minimal.json", BusynessReportDto.class);

        when(restTemplate.getForEntity(
                eq("http://busyness-service:5000/busyness"),
                eq(BusynessReportDto.class)))
                .thenReturn(ResponseEntity.ok(fixture));

        BusynessReportDto result = mlServiceClient.fetchBusynessReport();

        assertNotNull(result);
        assertEquals(2, result.getPredictions().size());
        assertEquals(0.72, result.getPredictions().get("zone-1"));

        verify(restTemplate).getForEntity(
                eq("http://busyness-service:5000/busyness"),
                eq(BusynessReportDto.class));
    }

    @Test
    void fetchBusynessReport_returnsForecastOnlyBody() {
        BusynessReportDto forecastOnly = new BusynessReportDto();
        forecastOnly.setSuccess(true);
        forecastOnly.setForecast(List.of(Map.of("zone", "zone-1", "value", 0.72)));

        when(restTemplate.getForEntity(
                eq("http://busyness-service:5000/busyness"),
                eq(BusynessReportDto.class)))
                .thenReturn(ResponseEntity.ok(forecastOnly));

        BusynessReportDto result = mlServiceClient.fetchBusynessReport();

        assertNotNull(result);
        assertEquals(1, result.getForecast().size());
    }

    @Test
    void isLlmServiceAvailable_checksHealthEndpoint() {
        when(restTemplate.getForEntity(
                eq("http://llm-service:5000/health"),
                eq(String.class)))
                .thenReturn(ResponseEntity.ok("OK"));

        assertTrue(mlServiceClient.isLlmServiceAvailable());

        verify(restTemplate).getForEntity(
                eq("http://llm-service:5000/health"),
                eq(String.class));
    }

    @Test
    void search_returnsNullOnRestClientException() {
        when(restTemplate.exchange(
                eq("http://llm-service:5000/search"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(MlSearchResponse.class)))
                .thenThrow(new org.springframework.web.client.RestClientException("Connection refused"));

        assertNull(mlServiceClient.search("test vibe", 5));
    }

    private <T> T loadFixture(String classpathResource, Class<T> type) throws Exception {
        InputStream stream = getClass().getClassLoader().getResourceAsStream(classpathResource);
        assertNotNull(stream, "Fixture not found on classpath: " + classpathResource);
        String json = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        return objectMapper.readValue(json, type);
    }
}
