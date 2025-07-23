package com.manhattan.busyness_predictor.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Collections;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
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
        final double ML_CONFIDENCE_THRESHOLD = 0.4; // Similarity score must be above this to be considered high-confidence.

        // 1. Fetch from ML service
        List<Location> mlLocations = new ArrayList<>();
        if (isMLServiceAvailable()) {
            mlLocations = fetchMLRecommendations(vibeDescription, maxResults);
        }

        // 2. Fetch from keyword search
        List<Location> keywordLocations = keywordFallback(vibeDescription);

        // 3. Combine and de-duplicate results, prioritizing keyword matches
        Map<Integer, Location> combinedLocations = new LinkedHashMap<>();

        // Add keyword results first, as they are more literal matches.
        keywordLocations.forEach(loc -> combinedLocations.putIfAbsent(loc.getId(), loc));

        // Then, fill the rest with ML results, skipping duplicates.
        mlLocations.forEach(loc -> {
            if (combinedLocations.size() < maxResults) {
                combinedLocations.putIfAbsent(loc.getId(), loc);
            }
        });

        // 4. Limit the final combined list
        List<Location> finalLocations = new ArrayList<>(combinedLocations.values());

        // 5. Set explanation and confidence for the response
        String explanation;
        double confidence;
        if (!mlLocations.isEmpty() && mlLocations.get(0).getSimilarity() >= ML_CONFIDENCE_THRESHOLD) {
            explanation = "Found results based on your vibe, supplemented with keyword matches.";
            confidence = mlLocations.get(0).getSimilarity();
        } else if (!finalLocations.isEmpty()) {
            explanation = "Couldn't find a strong vibe match. Here are results based on your keywords.";
            confidence = 0.5;
        } else {
            explanation = "No matching venues found for your query.";
            confidence = 0.0;
        }

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

    @SuppressWarnings("unchecked")
    public VibeSearchResponse getMapData() {
        logger.info("Fetching all locations and busyness data for map.");
        List<Location> allLocations = locationService.getAllLocations();

        // Fetch the full report including live and forecast data
        Map<String, Object> busynessReport = fetchBusynessReport();
        logger.info("Busyness report from Python: " + busynessReport);

        // Extract live busyness and forecast predictions separately
        Map<String, Double> liveBusyness = (Map<String, Double>) busynessReport.getOrDefault("live_busyness",
                Collections.emptyMap());

        // Forward predictions as a List<Map<String, Object>>
        Object rawPredictions = busynessReport.get("predictions");
        List<Map<String, Object>> predictionsList = new ArrayList<>();
        if (rawPredictions instanceof List) {
            predictionsList = (List<Map<String, Object>>) rawPredictions;
        } else if (rawPredictions instanceof Map) {
            Map<String, Object> predictionsMap = (Map<String, Object>) rawPredictions;
            for (Map.Entry<String, Object> entry : predictionsMap.entrySet()) {
                Map<String, Object> obj = new HashMap<>();
                obj.put("LocationID", entry.getKey());
                obj.put("predictions", entry.getValue());
                predictionsList.add(obj);
            }
        }
        logger.info("Predictions extracted: " + predictionsList);

        String explanation = "Complete location data for map view.";
        double confidence = 1.0;

        return buildResponse(allLocations, explanation, confidence, liveBusyness, predictionsList);
    }

    public Map<String, Double> getLiveBusyness() {
        logger.info("Fetching live busyness data.");
        return fetchBusynessData();
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
        } catch (RestClientException e) {
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
        if (resultsObj == null || !(resultsObj instanceof List<?>)) {
            logger.warn("ML response 'results' is not a list. Type: {}. Returning empty list.",
                    resultsObj == null ? "null" : resultsObj.getClass().getName());
            return Collections.emptyList();
        }

        List<?> rawLocations = (List<?>) resultsObj;
        List<Location> locations = new ArrayList<>();

        for (Object rawLocation : rawLocations) {
            if (rawLocation instanceof Map<?, ?> locMap) {
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
        // A simple improvement: treat keywords as mandatory.
        String[] keywords = vibeDesc.split("\\s+");
        if (keywords.length == 0) {
            return Collections.emptyList();
        }

        List<Location> allLocations = locationRepository.findAll();

        return allLocations.stream()
                .filter(loc -> {
                    String combined = (loc.getName() + " " + loc.getDescription() + " " + loc.getAddress())
                            .toLowerCase();
                    // All keywords must be present
                    for (String keyword : keywords) {
                        if (!combined.contains(keyword)) {
                            return false;
                        }
                    }
                    return true;
                })
                .limit(10) // Enforce limit for fallback as well
                .collect(Collectors.toList());
    }

    // Calls the busyness service to get predictions for all zones
    @SuppressWarnings("unchecked")
    private Map<String, Double> fetchBusynessData() {
        Map<String, Object> busynessReport = fetchBusynessReport();
        Object liveBusynessObj = busynessReport.get("live_busyness");

        if (liveBusynessObj instanceof Map) {
            // Ensure values are correctly typed to avoid class cast exceptions
            return ((Map<?, ?>) liveBusynessObj).entrySet().stream()
                    .filter(entry -> entry.getKey() instanceof String && entry.getValue() instanceof Number)
                    .collect(Collectors.toMap(
                            entry -> (String) entry.getKey(),
                            entry -> ((Number) entry.getValue()).doubleValue()));
        }
        return Collections.emptyMap();
    }

    // Fetches the complete busyness report (live + forecast) from the Python service
    public Map<String, Object> fetchBusynessReport() {
        try {
            logger.info("Calling busyness service at {}", busynessServiceUrl + "/busyness");
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    busynessServiceUrl + "/busyness",
                    HttpMethod.GET,
                    null,
                    new ParameterizedTypeReference<>() {});

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null
                    && Boolean.TRUE.equals(response.getBody().get("success"))) {
                logger.info("Busyness service responded successfully.");
                return response.getBody();
            } else {
                logger.warn("Busyness service call failed or returned unsuccessful. Status: {}", response.getStatusCode());
            }
        } catch (RestClientException e) {
            logger.error("Error calling busyness service: {}", e.getMessage(), e);
        }
        return Collections.emptyMap();
    }
    
    // Helper to build VibeSearchResponse DTO
    private VibeSearchResponse buildResponse(List<Location> locations, String explanation, double confidence,
            Map<String, Double> busynessData) {
        return buildResponse(locations, explanation, confidence, busynessData, Collections.emptyList());
    }

    // Overloaded helper to include predictions for the map view
    private VibeSearchResponse buildResponse(List<Location> locations, String explanation, double confidence,
            Map<String, Double> busynessData, List<Map<String, Object>> predictions) {
        VibeSearchResponse response = new VibeSearchResponse();
        List<LocationDto> locationDtos = locations.stream().map(LocationDto::fromLocation).collect(Collectors.toList());
        response.setLocations(locationDtos);
        response.setExplanation(explanation);
        response.setConfidence(confidence);
        response.setBusyness(busynessData);
        response.setPredictions(predictions);
        return response;
    }

    public List<LocationDto> findSimilarLocations(Integer locationId, Integer limit) {
        Location baseLocation = getLocationById(locationId);

        if (isMLServiceAvailable()) {
            List<Location> mlSimilar = fetchMLSimilarLocations(baseLocation, limit);
            if (!mlSimilar.isEmpty()) {
                return mlSimilar.stream().map(LocationDto::fromLocation).collect(Collectors.toList());
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
