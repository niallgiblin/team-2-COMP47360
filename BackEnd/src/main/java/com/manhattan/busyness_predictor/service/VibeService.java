package com.manhattan.busyness_predictor.service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import com.manhattan.busyness_predictor.dto.LocationDto;
import com.manhattan.busyness_predictor.dto.VibeSearchRequest;
import com.manhattan.busyness_predictor.dto.VibeSearchResponse;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.repository.LocationRepository;

@Service
public class VibeService {

    private static final Logger logger = LoggerFactory.getLogger(VibeService.class);

    private final RestTemplate restTemplate;

    @Value("${llm.service.url:http://llm-service:5000}")
    private String llmServiceUrl;

    @Value("${busyness.service.url:http://busyness-service:5000}")
    private String busynessServiceUrl;

    private final LocationRepository locationRepository;
    private final LocationService locationService;

    public VibeService(RestTemplateBuilder restTemplateBuilder,
            LocationRepository locationRepository,
            LocationService locationService) {
        this.restTemplate = restTemplateBuilder.build();
        this.locationRepository = locationRepository;
        this.locationService = locationService;
    }

    // Main entry for vibe search
    public VibeSearchResponse findLocationsByVibe(VibeSearchRequest request) {
        String vibeDescription = request.getVibeDescription();
        Integer maxResults = request.getMaxResults() != null ? request.getMaxResults() : 10;
        String explanation;
        double confidence;

        // Determine search strategy: queries with 2 or fewer words are treated as keyword searches.
        // More than 2 words are treated as a "vibe" for the ML model.
        boolean isVibeSearch = vibeDescription.trim().split("\\s+").length > 2;

        List<Location> primaryResults;
        List<Location> secondaryResults;

        // Now that data seeding is fixed, we can use the best search method for the query type.
        if (isMLServiceAvailable()) {
            if (isVibeSearch) {
                logger.info("Performing ML-first search for vibe: '{}'", vibeDescription);
                primaryResults = getLocationsByIdsInOrder(fetchMLRecommendationIds(vibeDescription, maxResults));
                secondaryResults = keywordFallback(vibeDescription, maxResults);
                explanation = "ML-powered recommendations based on your vibe description";
                confidence = 0.9;
            } else {
                logger.info("Performing keyword-first search for query: '{}'", vibeDescription);
                primaryResults = keywordFallback(vibeDescription, maxResults);
                secondaryResults = getLocationsByIdsInOrder(fetchMLRecommendationIds(vibeDescription, maxResults));
                explanation = "Search results based on your keywords";
                confidence = 0.7;
            }
        } else {
            // Fallback to keyword search if ML service is down
            primaryResults = keywordFallback(vibeDescription, maxResults);
            secondaryResults = Collections.emptyList();
            explanation = "Keyword fallback recommendations";
            confidence = 0.6;
        }

        // Combine and de-duplicate results, prioritizing the primary search method
        Map<Integer, Location> combinedResults = new LinkedHashMap<>();
        primaryResults.forEach(loc -> combinedResults.put(loc.getId(), loc));
        secondaryResults.forEach(loc -> combinedResults.putIfAbsent(loc.getId(), loc));

        List<Location> finalLocations = new ArrayList<>(combinedResults.values()).stream().limit(maxResults).collect(Collectors.toList());

        // Fetch busyness data regardless of the source of locations
        Map<String, Double> busynessData = fetchBusynessData();

        return buildResponse(finalLocations, explanation, confidence, busynessData);
    }

    public VibeSearchResponse getTrendingWithBusyness() {
        logger.info("Fetching top 5 trending locations with busyness data.");
        // getTrendingLocations() is already limited to 5 in LocationService
        List<Location> trendingLocations = locationService.getTrendingLocations();
        Map<String, Double> busynessData = fetchBusynessData();

        String explanation = "Top 5 trending locations right now.";
        double confidence = 0.8; // Confidence is moderate as it's based on reviews, not a direct query.

        return buildResponse(trendingLocations, explanation, confidence, busynessData);
    }

    public VibeSearchResponse getMapData() {
        logger.info("Fetching all locations and busyness data for map.");
        List<Location> allLocations = locationService.getAllLocations();
        Map<String, Double> busynessData = fetchBusynessData();

        String explanation = "Complete location data for map view.";
        double confidence = 1.0;

        return buildResponse(allLocations, explanation, confidence, busynessData);
    }

    // Check ML service health endpoint
    private boolean isMLServiceAvailable() {
        logger.info("Checking ML service health at {}", llmServiceUrl + "/health");
        try {
            ResponseEntity<String> healthResponse = restTemplate.getForEntity(llmServiceUrl + "/health", String.class);
            logger.info("ML service health check returned status: {}", healthResponse.getStatusCode());
            return healthResponse.getStatusCode().is2xxSuccessful();
        } catch (RestClientException e) {
            logger.warn("ML service health check failed: {}", e.getMessage());
            return false;
        }
    }

    // Calls the ML service with vibe query
    private List<Integer> fetchMLRecommendationIds(String vibeDescription, Integer maxResults) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> payload = Map.of(
                    "vibeDescription", vibeDescription,
                    "maxResults", maxResults);

            HttpEntity<Map<String, Object>> requestEntity = new HttpEntity<>(payload, headers);

            logger.info("Calling ML service at {}/search with vibe: '{}' and maxResults: {}", llmServiceUrl,
                    vibeDescription, maxResults);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    llmServiceUrl + "/search",
                    HttpMethod.POST,
                    requestEntity,
                    new ParameterizedTypeReference<Map<String, Object>>() {
                    });

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                logger.info("ML service responded with status {} and body: {}", response.getStatusCode(),
                        response.getBody());
                List<Integer> locationIds = parseLocationIdsFromMLResponse(response.getBody());
                logger.info("Parsed {} location IDs from ML service response.", locationIds.size());
                return locationIds;
            } else {
                logger.warn("ML service call failed or returned empty body. Status: {}, Body: {}",
                        response.getStatusCode(), response.getBody());
            }
        } catch (RestClientException e) {
            logger.error("Error calling ML service for vibe '{}': {}", vibeDescription, e.getMessage(), e);
        }
        return Collections.emptyList();
    }

    // Parses the ML service response map into Location objects
    private List<Integer> parseLocationIdsFromMLResponse(Map<String, Object> mlResponse) {
        if (mlResponse == null || !mlResponse.containsKey("results")) {
            logger.warn("ML response is null or does not contain 'results' key. Returning empty list.");
            return Collections.emptyList();
        }
        Object resultsObj = mlResponse.get("results");
        if (resultsObj == null || !(resultsObj instanceof List<?>)) {
            logger.warn("ML response 'results' is not a list. Type: {}. Returning empty list.",
                    resultsObj == null ? "null" : resultsObj.getClass().getName());
            return Collections.emptyList();
        }

        List<?> rawLocations = (List<?>) resultsObj;
        List<Integer> locationIds = new ArrayList<>();

        for (Object rawLocation : rawLocations) {
            if (rawLocation instanceof Map<?, ?> locMap) {
                Integer id = parseInteger(locMap.get("id"));
                if (id != null) {
                    locationIds.add(id);
                }
            }
        }
        return locationIds;
    }

    private Integer parseInteger(Object obj) {
        if (obj == null)
            return null;
        if (obj instanceof Number num)
            return num.intValue();
        try {
            return Integer.parseInt(obj.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Double parseDouble(Object obj) {
        if (obj == null)
            return null;
        if (obj instanceof Number num)
            return num.doubleValue();
        try {
            return Double.parseDouble(obj.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public List<Location> getLocationsByIds(List<Integer> locationIds) {
        if (locationIds == null || locationIds.isEmpty()) {
            return Collections.emptyList();
        }
        return locationRepository.findAllById(locationIds);
    }

    private List<Location> getLocationsByIdsInOrder(List<Integer> ids) {
        if (ids == null || ids.isEmpty()) {
            return Collections.emptyList();
        }
        List<Location> unorderedLocations = locationRepository.findAllById(ids);
        // Re-order to match the original ID list order, which represents relevance
        return ids.stream()
                .flatMap(id -> unorderedLocations.stream().filter(loc -> loc.getId().equals(id)))
                .collect(Collectors.toList());
    }

    // Simple keyword fallback search
    private List<Location> keywordFallback(String vibeDescription, Integer limit) {
        String[] keywords = vibeDescription.toLowerCase().trim().split("\\s+");
        if (keywords.length == 0) {
            return Collections.emptyList();
        }

        List<Location> allLocations = locationRepository.findAll();

        return allLocations.stream()
                .filter(loc -> {
                    // Build a comprehensive text block to search against, handling nulls
                    String searchableText = String.join(" ",
                            loc.getName() != null ? loc.getName().toLowerCase() : "",
                            loc.getDescription() != null ? loc.getDescription().toLowerCase() : "",
                            loc.getSummary() != null ? loc.getSummary().toLowerCase() : "",
                            loc.getTags() != null ? loc.getTags().toLowerCase() : "",
                            loc.getAddress() != null ? loc.getAddress().toLowerCase() : ""
                    );

                    // Check if all keywords are present in the text block
                    return java.util.Arrays.stream(keywords).allMatch(searchableText::contains);
                })
                .limit(limit) // Enforce limit for fallback as well
                .collect(Collectors.toList());
    }

    // Calls the busyness service to get predictions for all zones
    @SuppressWarnings("unchecked")
    private Map<String, Double> fetchBusynessData() {
        try {
            logger.info("Calling busyness service at {}", busynessServiceUrl + "/busyness");
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    busynessServiceUrl + "/busyness",
                    HttpMethod.GET,
                    null,
                    new ParameterizedTypeReference<Map<String, Object>>() {
                    });

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null
                    && Boolean.TRUE.equals(response.getBody().get("success"))) {
                logger.info("Busyness service responded successfully.");
                Object predictionsObj = response.getBody().get("predictions");
                if (predictionsObj instanceof Map) {
                    // The python service now returns a simple Map<String, Double>.
                    // We need to ensure the values are correctly typed.
                    return ((Map<?, ?>) predictionsObj).entrySet().stream()
                            .filter(entry -> entry.getKey() instanceof String && entry.getValue() instanceof Number)
                            .collect(Collectors.toMap(
                                    entry -> (String) entry.getKey(),
                                    entry -> ((Number) entry.getValue()).doubleValue()));
                }
            } else {
                logger.warn("Busyness service call failed or returned unsuccessful. Status: {}",
                        response.getStatusCode());
            }
        } catch (RestClientException e) {
            logger.error("Error calling busyness service: {}", e.getMessage(), e);
        }
        return Collections.emptyMap();
    }

    // Helper to build VibeSearchResponse DTO
    private VibeSearchResponse buildResponse(List<Location> locations, String explanation, double confidence,
            Map<String, Double> busynessData) {
        VibeSearchResponse response = new VibeSearchResponse();
        List<LocationDto> locationDtos = locations.stream().map(LocationDto::fromLocation).collect(Collectors.toList());
        response.setLocations(locationDtos);
        response.setExplanation(explanation);
        response.setConfidence(confidence);
        response.setBusyness(busynessData);
        return response;
    }

    public List<LocationDto> findSimilarLocations(Integer locationId, Integer limit) {
        Location baseLocation = getLocationById(locationId);

        if (isMLServiceAvailable()) {
            List<Integer> similarIds = fetchMLSimilarLocationIds(baseLocation, limit);
            if (!similarIds.isEmpty()) {
                List<Location> similarLocations = getLocationsByIds(similarIds);
                // Re-order to match ML service relevance
                return similarIds.stream()
                    .flatMap(id -> similarLocations.stream().filter(loc -> loc.getId().equals(id)))
                    .map(LocationDto::fromLocation)
                    .collect(Collectors.toList());
            }
        }
        
        // Fallback if ML service is down or returns no results
        return findSimilarByCategory(baseLocation, limit);
    }

    /**
     * Calls ML service to get similar locations based on a given location.
     */
    private List<Integer> fetchMLSimilarLocationIds(Location baseLocation, Integer limit) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> payload = Map.of(
                    "location_name", baseLocation.getName(),
                    "location_description", baseLocation.getDescription() != null ? baseLocation.getDescription() : "",
                    "maxResults", limit != null ? limit : 10);

            HttpEntity<Map<String, Object>> requestEntity = new HttpEntity<>(payload, headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    llmServiceUrl + "/similar",
                    HttpMethod.POST,
                    requestEntity,
                    new ParameterizedTypeReference<Map<String, Object>>() {
                    });

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return parseLocationIdsFromMLResponse(response.getBody());
            }
        } catch (Exception e) {
            // Log if needed
        }
        return Collections.emptyList();
    }

    /**
     * Fallback similarity: find locations by matching category/type.
     */
    private List<LocationDto> findSimilarByCategory(Location baseLocation, Integer limit) {
        List<Location> candidates;
        if (baseLocation.getIsRestaurant() != null && baseLocation.getIsRestaurant()) {
            candidates = locationRepository.findByIsRestaurantTrue();
        } else if (baseLocation.getIsBar() != null && baseLocation.getIsBar()) {
            candidates = locationRepository.findByIsBarTrue();
        } else if (baseLocation.getIsClub() != null && baseLocation.getIsClub()) {
            candidates = locationRepository.findByIsClubTrue();
        } else if (baseLocation.getIsLandmark() != null && baseLocation.getIsLandmark()) {
            candidates = locationRepository.findByIsLandmarkTrue();
        } else {
            candidates = Collections.emptyList();
        }

        return candidates.stream()
                .filter(loc -> !loc.getId().equals(baseLocation.getId()))
                .limit(limit)
                .map(LocationDto::fromLocation).collect(Collectors.toList());
    }

    /**
     * Get a Location entity by its ID or throw if not found.
     */
    public Location getLocationById(Integer id) {
        return locationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Location not found with id: " + id));
    }
}
