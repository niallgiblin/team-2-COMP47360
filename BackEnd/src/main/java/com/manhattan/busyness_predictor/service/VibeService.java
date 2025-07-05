package com.manhattan.busyness_predictor.service;

import java.util.ArrayList;
import java.util.Collections;
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
import org.springframework.web.client.RestTemplate;

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
        List<Location> locations = new ArrayList<>();
        String explanation = "Keyword fallback recommendations";
        double confidence = 0.6;
        Integer maxResults = request.getMaxResults() != null ? request.getMaxResults() : 10;

        if (isMLServiceAvailable()) {
            List<Location> mlLocations = fetchMLRecommendations(request.getVibeDescription(), maxResults);
            if (!mlLocations.isEmpty()) {
                locations = mlLocations;
                explanation = "ML-powered recommendations based on your vibe description";
                confidence = 0.9;
            }
        }

        if (locations.isEmpty()) {
            logger.warn("ML service did not return results for vibe: '{}'. Using keyword fallback.",
                    request.getVibeDescription());
            locations = keywordFallback(request.getVibeDescription());
        }

        // Fetch busyness data regardless of the source of locations
        Map<String, Double> busynessData = fetchBusynessData();

        return buildResponse(locations, explanation, confidence, busynessData);
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
        } catch (Exception e) {
            logger.warn("ML service health check failed: {}", e.getMessage());
            return false;
        }
    }

    // Calls the ML service with vibe query
    private List<Location> fetchMLRecommendations(String vibeDescription, Integer maxResults) {
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
                List<Location> mlLocations = parseLocationsFromMLResponse(response.getBody());
                logger.info("Parsed {} locations from ML service response.", mlLocations.size());
                return mlLocations;
            } else {
                logger.warn("ML service call failed or returned empty body. Status: {}, Body: {}",
                        response.getStatusCode(), response.getBody());
            }
        } catch (Exception e) {
            logger.error("Error calling ML service for vibe '{}': {}", vibeDescription, e.getMessage(), e);
        }
        return Collections.emptyList();
    }

    // Parses the ML service response map into Location objects
    private List<Location> parseLocationsFromMLResponse(Map<String, Object> mlResponse) {
        if (mlResponse == null || !mlResponse.containsKey("results")) {
            logger.warn("ML response is null or does not contain 'results' key. Returning empty list.");
            return Collections.emptyList();
        }
        Object resultsObj = mlResponse.get("results");
        if (!(resultsObj instanceof List<?>)) {
            logger.warn("ML response 'results' is not a list. Type: {}. Returning empty list.",
                    resultsObj.getClass().getName());
            return Collections.emptyList();
        }

        List<?> rawLocations = (List<?>) resultsObj;
        List<Location> locations = new ArrayList<>();

        for (Object rawLocation : rawLocations) {
            if (rawLocation instanceof Map<?, ?>) {
                Map<?, ?> locMap = (Map<?, ?>) rawLocation;
                Location location = mapToLocation(locMap);
                if (location != null) {
                    locations.add(location);
                }
            }
        }
        return locations;
    }

    private Float parseRating(Object ratingObj) {
        if (ratingObj == null)
            return 0f;

        String ratingStr = ratingObj.toString();
        Pattern pattern = Pattern.compile("(\\d+(\\.\\d+)?)");
        Matcher matcher = pattern.matcher(ratingStr);

        if (matcher.find()) {
            try {
                return Float.parseFloat(matcher.group(1));
            } catch (NumberFormatException e) {
                /* Fallthrough */ }
        }
        return 0f;
    }

    // Converts a Map representing a location to a Location entity
    private Location mapToLocation(Map<?, ?> locMap) {
        try {
            Location location = new Location();
            location.setId(parseInteger(locMap.get("id")));
            location.setName(parseString(locMap.get("name")));
            location.setAddress(parseString(locMap.get("address")));
            location.setDescription(parseString(locMap.get("description")));
            location.setPrice(parseInteger(locMap.get("price")));
            location.setLat(parseDouble(locMap.get("lat")));
            location.setLng(parseDouble(locMap.get("lng")));
            location.setUri(parseString(locMap.get("uri")));
            location.setReview(parseRating(locMap.get("review")));
            location.setNumReviews(parseInteger(locMap.get("numReviews")));
            location.setZone(parseString(locMap.get("zone")));
            location.setSimilarity(parseDouble(locMap.get("similarity")));
            return location;
        } catch (Exception e) {
            logger.error("Failed to parse location from ML response map: {}", locMap, e);
            return null; // Return null if parsing fails
        }
    }

    private Integer parseInteger(Object obj) {
        if (obj == null)
            return null;
        if (obj instanceof Number)
            return ((Number) obj).intValue();
        try {
            return Integer.parseInt(obj.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Double parseDouble(Object obj) {
        if (obj == null)
            return null;
        if (obj instanceof Number)
            return ((Number) obj).doubleValue();
        try {
            return Double.parseDouble(obj.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String parseString(Object obj) {
        return obj != null ? obj.toString() : null;
    }
    
    public List<Location> getLocationsByIds(List<Integer> locationIds) {
        if (locationIds == null || locationIds.isEmpty()) {
            return Collections.emptyList();
        }
        return locationRepository.findAllById(locationIds);
    }

    // Simple keyword fallback search
    private List<Location> keywordFallback(String vibeDescription) {
        String vibeDesc = vibeDescription.toLowerCase();
        List<Location> allLocations = locationRepository.findAll();

        return allLocations.stream()
                .filter(loc -> {
                    String combined = (loc.getName() + " " + loc.getDescription() + " " + loc.getAddress())
                            .toLowerCase();
                    for (String keyword : vibeDesc.split("\\s+")) {
                        if (combined.contains(keyword))
                            return true;
                    }
                    return false;
                })
                .limit(10) // Enforce limit for fallback as well
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
        } catch (Exception e) {
            logger.error("Error calling busyness service: {}", e.getMessage(), e);
        }
        return Collections.emptyMap();
    }

    // Helper to build VibeSearchResponse DTO
    private VibeSearchResponse buildResponse(List<Location> locations, String explanation, double confidence,
            Map<String, Double> busynessData) {
        VibeSearchResponse response = new VibeSearchResponse();
        response.setLocations(locations);
        response.setExplanation(explanation);
        response.setConfidence(confidence);
        response.setBusyness(busynessData);
        return response;
    }

    public List<Location> findSimilarLocations(Integer locationId, Integer limit) {
        Location baseLocation = getLocationById(locationId);

        if (isMLServiceAvailable()) {
            List<Location> mlSimilar = fetchMLSimilarLocations(baseLocation, limit);
            if (!mlSimilar.isEmpty()) {
                return mlSimilar;
            }
        }

        return findSimilarByCategory(baseLocation, limit);
    }

    /**
     * Calls ML service to get similar locations based on a given location.
     */
    private List<Location> fetchMLSimilarLocations(Location baseLocation, Integer limit) {
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
                return parseLocationsFromMLResponse(response.getBody());
            }
        } catch (Exception e) {
            // Log if needed
        }
        return Collections.emptyList();
    }

    /**
     * Fallback similarity: find locations by matching category/type.
     */
    private List<Location> findSimilarByCategory(Location baseLocation, Integer limit) {
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
                .limit(limit != null ? limit : 10)
                .collect(Collectors.toList());
    }

    /**
     * Get a Location entity by its ID or throw if not found.
     */
    public Location getLocationById(Integer id) {
        return locationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Location not found with id: " + id));
    }
}
