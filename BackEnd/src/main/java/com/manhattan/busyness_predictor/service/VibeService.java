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
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.time.Instant;

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
import org.springframework.http.HttpStatus;

import com.manhattan.busyness_predictor.dto.LocationDto;
import com.manhattan.busyness_predictor.dto.VibeSearchRequest;
import com.manhattan.busyness_predictor.dto.VibeSearchResponse;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import org.springframework.data.domain.PageRequest;

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

    // Cache for search results
    private final Map<String, CachedSearchResult> searchCache = new ConcurrentHashMap<>();
    private static final long CACHE_DURATION_SECONDS = 300; // 5 minutes

    // Cache for busyness data
    private Map<String, Double> busynessCache = new HashMap<>();
    private Instant lastBusynessFetch = null;
    private static final long BUSYNESS_CACHE_DURATION_SECONDS = 600; // 10 minutes

    // Cache for map data
    private VibeSearchResponse cachedMapData = null;
    private Instant lastMapDataFetch = null;
    private static final long MAP_DATA_CACHE_DURATION_SECONDS = 300; // 5 minutes

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

        // Check cache first
        String cacheKey = generateCacheKey(vibeDescription, maxResults);
        CachedSearchResult cached = searchCache.get(cacheKey);
        if (cached != null && !cached.isExpired()) {
            logger.info("Returning cached search result for: {}", vibeDescription);
            return cached.getResponse();
        }

        // 1. Fetch ML recommendations
        List<Location> mlLocations = fetchMLRecommendations(vibeDescription, maxResults);
        
        // 3. Use only ML results (no keyword fallback)
        List<Location> finalLocations = mlLocations;
        
        // 4. Set explanation and confidence based on ML results
        String explanation = "Found locations using AI-powered semantic search.";
        double confidence = mlLocations.isEmpty() ? 0.0 : 
                          mlLocations.get(0).getSimilarity() != null ? mlLocations.get(0).getSimilarity() : 0.0;

        // 5. Get busyness data
        Map<String, Double> busynessData = getLiveBusyness();

        // 6. Build and cache response
        VibeSearchResponse response = buildResponse(finalLocations, explanation, confidence, busynessData);
        
        // Cache the result
        searchCache.put(cacheKey, new CachedSearchResult(response));
        
        return response;
    }

    private String generateCacheKey(String vibeDescription, Integer maxResults) {
        return vibeDescription.toLowerCase().trim() + "|" + maxResults;
    }

    // Cache class for search results
    private static class CachedSearchResult {
        private final VibeSearchResponse response;
        private final Instant timestamp;

        public CachedSearchResult(VibeSearchResponse response) {
            this.response = response;
            this.timestamp = Instant.now();
        }

        public VibeSearchResponse getResponse() {
            return response;
        }

        public boolean isExpired() {
            return Instant.now().isAfter(timestamp.plusSeconds(CACHE_DURATION_SECONDS));
        }
    }

    public VibeSearchResponse getTrendingWithBusyness() {
        logger.info("Fetching top 5 trending locations with busyness data.");
        // getTrendingLocations() is already limited to 5 in LocationService
        List<Location> trendingLocations = locationService.getTrendingLocations();
        Map<String, Double> busynessData = getLiveBusyness();

        String explanation = "Top 5 trending locations right now.";
        double confidence = 0.8; // Confidence is moderate as it's based on reviews, not a direct query.

        return buildResponse(trendingLocations, explanation, confidence, busynessData);
    }

    @SuppressWarnings("unchecked")
    public VibeSearchResponse getMapData() {
        logger.info("Fetching all locations and busyness data for map.");
        
        // Check if we have cached map data
        if (lastMapDataFetch != null && 
            Instant.now().isBefore(lastMapDataFetch.plusSeconds(MAP_DATA_CACHE_DURATION_SECONDS)) &&
            cachedMapData != null) {
            logger.info("Using cached map data");
            return cachedMapData;
        }
        
        List<Location> allLocations = locationService.getAllLocations();

        // Fetch the full report including live and forecast data
        Map<String, Object> busynessReport = fetchBusynessReport();
        logger.info("🔍 [DEBUG] Raw busyness report: {}", busynessReport);

        // Extract live busyness from the predictions field
        Map<String, Double> liveBusyness = new HashMap<>();
        if (busynessReport.containsKey("predictions")) {
            @SuppressWarnings("unchecked")
            Map<String, Object> predictions = (Map<String, Object>) busynessReport.get("predictions");
            for (Map.Entry<String, Object> entry : predictions.entrySet()) {
                if (entry.getValue() instanceof Number) {
                    liveBusyness.put(entry.getKey(), ((Number) entry.getValue()).doubleValue());
                }
            }
        }
        logger.info("🔍 [DEBUG] Extracted live busyness: {}", liveBusyness);

        // Extract forecast (time series) for each zone
        Object rawForecast = busynessReport.get("forecast");
        logger.info("🔍 [DEBUG] Raw forecast data: {}", rawForecast);
        List<Object> predictions = new ArrayList<>();
        if (rawForecast instanceof List) {
            predictions = (List<Object>) rawForecast;
            logger.info("🔍 [DEBUG] Processed predictions list: {}", predictions);
        }

        String explanation = "Complete location data for map view.";
        double confidence = 1.0;

        VibeSearchResponse response = buildResponse(allLocations, explanation, confidence, liveBusyness, predictions);
        
        // Cache the response
        cachedMapData = response;
        lastMapDataFetch = Instant.now();
        logger.info("Cached map data for {} seconds", MAP_DATA_CACHE_DURATION_SECONDS);
        
        return response;
    }

    public Map<String, Double> getLiveBusyness() {
        // Check if we have recent busyness data in cache
        if (lastBusynessFetch != null && 
            Instant.now().isBefore(lastBusynessFetch.plusSeconds(BUSYNESS_CACHE_DURATION_SECONDS)) &&
            !busynessCache.isEmpty()) {
            logger.info("Using cached busyness data");
            return busynessCache;
        }

        try {
            Map<String, Object> report = fetchBusynessReport();
            if (report != null && report.containsKey("busyness")) {
                @SuppressWarnings("unchecked")
                Map<String, Double> newBusyness = (Map<String, Double>) report.get("busyness");
                busynessCache = newBusyness;
                lastBusynessFetch = Instant.now();
                logger.info("Updated busyness cache with {} entries", newBusyness.size());
                return newBusyness;
            }
        } catch (Exception e) {
            logger.error("Failed to fetch busyness data: {}", e.getMessage());
        }
        
        return busynessCache.isEmpty() ? new HashMap<>() : busynessCache;
    }

    private boolean isMLServiceAvailable() {
        try {
            ResponseEntity<String> response = restTemplate.getForEntity(llmServiceUrl + "/health", String.class);
            return response.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            logger.warn("ML service health check failed: {}", e.getMessage());
            return false;
        }
    }

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

                // ENRICH: Replace each ML location with the full DB version if available
                List<Location> enriched = new ArrayList<>();
                for (Location loc : mlLocations) {
                    Integer locId = loc.getId();
                    if (locId != null) {
                        Optional<Location> dbLocOpt = locationRepository.findById(locId);
                        if (dbLocOpt.isPresent()) {
                            Location dbLoc = dbLocOpt.get();
                            // Preserve the ML similarity value
                            dbLoc.setSimilarity(loc.getSimilarity());
                            enriched.add(dbLoc);
                        } else {
                            logger.warn("ML location with id {} not found in DB. Using ML version.", locId);
                            enriched.add(loc);
                        }
                    } else {
                        logger.warn("ML location missing id. Using ML version: {}", loc);
                        enriched.add(loc);
                    }
                }
                logger.info("Enriched ML locations with DB data. Returning {} locations.", enriched.size());
                return enriched;
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

    private Location mapToLocation(Map<?, ?> locMap) {
        try {
            Location location = new Location();
            location.setId(parseInteger(locMap.get("id")));
            location.setName(parseString(locMap.get("name")));
            location.setAddress(parseString(locMap.get("address")));
            location.setLat(parseDouble(locMap.get("latitude")));
            location.setLng(parseDouble(locMap.get("longitude")));
            location.setDescription(parseString(locMap.get("description")));
            location.setPrice(parseInteger(locMap.get("price")));
            location.setReview(parseRating(locMap.get("rating")));
            location.setZone(parseString(locMap.get("zone")));
            location.setSimilarity(parseDouble(locMap.get("similarity")));
            return location;
        } catch (Exception e) {
            logger.error("Error mapping location from ML response: {}", e.getMessage());
            return null;
        }
    }

    private Integer parseInteger(Object obj) {
        if (obj == null) return null;
        try {
            if (obj instanceof Number) {
                return ((Number) obj).intValue();
            }
            return Integer.parseInt(obj.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Double parseDouble(Object obj) {
        if (obj == null) return null;
        try {
            if (obj instanceof Number) {
                return ((Number) obj).doubleValue();
            }
            return Double.parseDouble(obj.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String parseString(Object obj) {
        return obj != null ? obj.toString() : null;
    }

    public List<Location> getLocationsByIds(List<Integer> locationIds) {
        return locationRepository.findAllById(locationIds);
    }



    @SuppressWarnings("unchecked")
    private Map<String, Double> fetchBusynessData() {
        try {
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    busynessServiceUrl + "/busyness",
                    HttpMethod.GET,
                    null,
                    new ParameterizedTypeReference<Map<String, Object>>() {
                    });

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return (Map<String, Double>) response.getBody().get("busyness");
            }
        } catch (Exception e) {
            logger.error("Error fetching busyness data: {}", e.getMessage());
        }
        return new HashMap<>();
    }

    private Map<String, Object> fetchBusynessReport() {
        try {
            String busynessServiceUrl = "http://busyness-service:5000";
            RestTemplate restTemplate = new RestTemplate();
            
            // Use the correct endpoint
            ResponseEntity<Map> response = restTemplate.getForEntity(
                busynessServiceUrl + "/busyness",
                Map.class
            );
            
            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                Map<String, Object> body = response.getBody();
                logger.info("🔍 [DEBUG] Raw busyness report: {}", body);
                
                // The busyness service returns data in the 'predictions' field
                @SuppressWarnings("unchecked")
                Map<String, Object> predictions = (Map<String, Object>) body.get("predictions");
                
                if (predictions != null) {
                    logger.info("🔍 [DEBUG] Extracted predictions: {}", predictions);
                    return body; // Return the full response including predictions and forecast
                }
            }
        } catch (Exception e) {
            logger.error("Error fetching busyness report: {}", e.getMessage());
        }
        
        logger.info("🔍 [DEBUG] Raw busyness report: {}");
        logger.info("🔍 [DEBUG] Extracted live busyness: {}");
        logger.info("🔍 [DEBUG] Raw forecast data: null");
        return new HashMap<>();
    }

    private VibeSearchResponse buildResponse(List<Location> locations, String explanation, double confidence,
            Map<String, Double> busynessData) {
        List<LocationDto> locationDtos = locations.stream()
                .map(LocationDto::fromLocation)
                .collect(Collectors.toList());

        VibeSearchResponse response = new VibeSearchResponse();
        response.setLocations(locationDtos);
        response.setExplanation(explanation);
        response.setConfidence(confidence);
        response.setBusyness(busynessData);
        return response;
    }

    private VibeSearchResponse buildResponse(List<Location> locations, String explanation, double confidence,
            Map<String, Double> busynessData, List<Object> predictions) {
        List<LocationDto> locationDtos = locations.stream()
                .map(LocationDto::fromLocation)
                .collect(Collectors.toList());

        VibeSearchResponse response = new VibeSearchResponse();
        response.setLocations(locationDtos);
        response.setExplanation(explanation);
        response.setConfidence(confidence);
        response.setBusyness(busynessData);
        response.setPredictions(predictions);
        return response;
    }

    public List<LocationDto> findSimilarLocations(Integer locationId, Integer limit) {
        Optional<Location> baseLocationOpt = locationRepository.findById(locationId);
        if (baseLocationOpt.isEmpty()) {
            return Collections.emptyList();
        }

        Location baseLocation = baseLocationOpt.get();
        List<Location> similarLocations = new ArrayList<>();

        // Try ML-based similarity first
        if (isMLServiceAvailable()) {
            similarLocations = fetchMLSimilarLocations(baseLocation, limit);
        }

        // Fallback to category-based similarity
        if (similarLocations.isEmpty()) {
            similarLocations = findSimilarByCategory(baseLocation, limit);
        }

        return similarLocations.stream()
                .map(LocationDto::fromLocation)
                .collect(Collectors.toList());
    }

    private List<Location> fetchMLSimilarLocations(Location baseLocation, Integer limit) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> payload = Map.of(
                    "locationId", baseLocation.getId(),
                    "limit", limit);

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
            logger.error("Error fetching ML similar locations: {}", e.getMessage());
        }
        return Collections.emptyList();
    }

    private List<Location> findSimilarByCategory(Location baseLocation, Integer limit) {
        String baseType = baseLocation.getType();
        String baseZone = baseLocation.getZone();

        List<Location> similar = new ArrayList<>();
        
        // Try to find similar locations by type and zone
        if (baseType != null && baseZone != null) {
            similar = locationRepository.findByType(baseType.toLowerCase());
            similar = similar.stream()
                    .filter(loc -> !loc.getId().equals(baseLocation.getId()))
                    .limit(limit)
                    .collect(Collectors.toList());
        }

        // If no results, try just by type
        if (similar.isEmpty() && baseType != null) {
            similar = locationRepository.findByType(baseType.toLowerCase());
            similar = similar.stream()
                    .filter(loc -> !loc.getId().equals(baseLocation.getId()))
                    .limit(limit)
                    .collect(Collectors.toList());
        }

        return similar;
    }

    public Location getLocationById(Integer id) {
        return locationRepository.findById(id).orElse(null);
    }
}
