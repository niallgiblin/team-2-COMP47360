package com.manhattan.busyness_predictor.service;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import com.manhattan.busyness_predictor.dto.BusynessReportDto;
import com.manhattan.busyness_predictor.dto.MlSearchResponse;

@Service
public class MlServiceClient {

    private static final Logger logger = LoggerFactory.getLogger(MlServiceClient.class);

    private final RestTemplate restTemplate;

    @Value("${llm.service.url}")
    private String llmServiceUrl;

    @Value("${busyness.service.url}")
    private String busynessServiceUrl;

    public MlServiceClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public boolean isLlmServiceAvailable() {
        try {
            ResponseEntity<String> response = restTemplate.getForEntity(llmServiceUrl + "/health", String.class);
            return response.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            return false;
        }
    }

    public MlSearchResponse search(String vibeDescription, int maxResults) {
        return search(vibeDescription, maxResults, null, null);
    }

    public MlSearchResponse search(String vibeDescription, int maxResults, String location, String priceRange) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("vibeDescription", vibeDescription);
            payload.put("maxResults", maxResults);
            if (location != null && !location.isBlank()) {
                payload.put("location", location);
            }
            if (priceRange != null && !priceRange.isBlank()) {
                payload.put("priceRange", priceRange);
            }

            HttpEntity<Map<String, Object>> requestEntity = new HttpEntity<>(payload, headers);

            ResponseEntity<MlSearchResponse> response = restTemplate.exchange(
                    llmServiceUrl + "/search",
                    HttpMethod.POST,
                    requestEntity,
                    MlSearchResponse.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return response.getBody();
            }
        } catch (RestClientException e) {
            logger.error("Error calling ML search for vibe '{}': {}", vibeDescription, e.getMessage(), e);
        }
        return null;
    }

    public MlSearchResponse findSimilar(Map<String, Object> venuePayload) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<Map<String, Object>> requestEntity = new HttpEntity<>(venuePayload, headers);

            ResponseEntity<MlSearchResponse> response = restTemplate.exchange(
                    llmServiceUrl + "/similar",
                    HttpMethod.POST,
                    requestEntity,
                    MlSearchResponse.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return response.getBody();
            }
        } catch (Exception e) {
            logger.error("Error calling ML similar endpoint: {}", e.getMessage());
        }
        return null;
    }

    public BusynessReportDto fetchBusynessReport() {
        try {
            ResponseEntity<BusynessReportDto> response = restTemplate.getForEntity(
                    busynessServiceUrl + "/busyness",
                    BusynessReportDto.class);

            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                BusynessReportDto body = response.getBody();
                if (body.getPredictions() != null || (body.getForecast() != null && !body.getForecast().isEmpty())) {
                    return body;
                }
            }
        } catch (Exception e) {
            logger.error("Error fetching busyness report: {}", e.getMessage());
        }

        return null;
    }
}
