package com.manhattan.busyness_predictor.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Collections;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.data.domain.PageRequest;

import com.manhattan.busyness_predictor.dto.BusynessReportDto;
import com.manhattan.busyness_predictor.dto.LocationDto;
import com.manhattan.busyness_predictor.dto.MlSearchResponse;
import com.manhattan.busyness_predictor.dto.SimilarLocationsResult;
import com.manhattan.busyness_predictor.dto.VibeSearchRequest;
import com.manhattan.busyness_predictor.dto.VibeSearchResponse;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.repository.LocationRepository;

@Service
public class VibeService {

    private static final Logger logger = LoggerFactory.getLogger(VibeService.class);

    private final MlServiceClient mlServiceClient;
    private final LocationRepository locationRepository;
    private final LocationService locationService;
    private final MlResponseMapper mlResponseMapper;

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

    public VibeService(MlServiceClient mlServiceClient,
            LocationRepository locationRepository,
            LocationService locationService,
            MlResponseMapper mlResponseMapper) {
        this.mlServiceClient = mlServiceClient;
        this.locationRepository = locationRepository;
        this.locationService = locationService;
        this.mlResponseMapper = mlResponseMapper;
    }

    // Main entry for vibe search
    public VibeSearchResponse findLocationsByVibe(VibeSearchRequest request) {
        String vibeDescription = request.getVibeDescription();
        Integer maxResults = request.getMaxResults() != null ? request.getMaxResults() : 10;

        // Check cache first
        String cacheKey = generateCacheKey(vibeDescription, maxResults, request.getLocation(), request.getPriceRange());
        CachedSearchResult cached = searchCache.get(cacheKey);
        if (cached != null && !cached.isExpired()) {
            logger.info("Returning cached search result for: {}", vibeDescription);
            return cached.getResponse();
        }

        // 1. Fetch ML recommendations
        List<Location> mlLocations = fetchMLRecommendations(
                vibeDescription,
                maxResults,
                request.getLocation(),
                request.getPriceRange());
        
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

    private String generateCacheKey(String vibeDescription, Integer maxResults, String location, String priceRange) {
        return normalizeCachePart(vibeDescription) + "|"
                + maxResults + "|"
                + normalizeCachePart(location) + "|"
                + normalizeCachePart(priceRange);
    }

    private String normalizeCachePart(String value) {
        return value == null ? "" : value.toLowerCase().trim();
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

        BusynessReportDto busynessReport = mlServiceClient.fetchBusynessReport();
        Map<String, Double> liveBusyness = mlResponseMapper.toPredictions(busynessReport);
        List<Object> forecast = mlResponseMapper.toForecast(busynessReport);

        String explanation = "Complete location data for map view.";
        double confidence = 1.0;

        VibeSearchResponse response = buildResponse(allLocations, explanation, confidence, liveBusyness, forecast);
        
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
            BusynessReportDto report = mlServiceClient.fetchBusynessReport();
            Map<String, Double> newBusyness = mlResponseMapper.toPredictions(report);
            if (!newBusyness.isEmpty()) {
                busynessCache = new HashMap<>(newBusyness);
                lastBusynessFetch = Instant.now();
                logger.info("Updated busyness cache with {} entries", newBusyness.size());
                return newBusyness;
            }
        } catch (Exception e) {
            logger.error("Failed to fetch busyness data: {}", e.getMessage());
        }
        
        return busynessCache.isEmpty() ? new HashMap<>() : busynessCache;
    }

    private List<Location> fetchMLRecommendations(
            String vibeDescription,
            Integer maxResults,
            String location,
            String priceRange) {
        MlSearchResponse response = mlServiceClient.search(vibeDescription, maxResults, location, priceRange);
        if (response != null) {
            List<Location> mlLocations = mlResponseMapper.toLocations(response);
            return enrichFromDatabase(mlLocations);
        }
        return Collections.emptyList();
    }

    private List<Location> enrichFromDatabase(List<Location> mlLocations) {
        List<Location> enriched = new ArrayList<>();
        for (Location loc : mlLocations) {
            Integer locId = loc.getId();
            if (locId != null) {
                Optional<Location> dbLocOpt = locationRepository.findById(locId);
                if (dbLocOpt.isPresent()) {
                    Location dbLoc = dbLocOpt.get();
                    dbLoc.setSimilarity(loc.getSimilarity());
                    enriched.add(dbLoc);
                } else {
                    enriched.add(loc);
                }
            } else {
                enriched.add(loc);
            }
        }
        return enriched;
    }

    public List<Location> getLocationsByIds(List<Integer> locationIds) {
        return locationRepository.findAllById(locationIds);
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

    public SimilarLocationsResult findSimilarLocations(Integer locationId, Integer limit) {
        Optional<Location> baseLocationOpt = locationRepository.findById(locationId);
        if (baseLocationOpt.isEmpty()) {
            return new SimilarLocationsResult(Collections.emptyList(), "category");
        }

        Location baseLocation = baseLocationOpt.get();
        List<Location> similarLocations = Collections.emptyList();
        String source = "category";

        if (mlServiceClient.isLlmServiceAvailable()) {
            List<Location> mlResults = fetchMLSimilarLocations(baseLocation, limit);
            if (!mlResults.isEmpty()) {
                similarLocations = mlResults;
                source = "ml";
            }
        }

        if (similarLocations.isEmpty()) {
            similarLocations = findSimilarByCategory(baseLocation, limit);
            source = "category";
        }

        List<LocationDto> dtos = similarLocations.stream()
                .map(LocationDto::fromLocation)
                .collect(Collectors.toList());
        return new SimilarLocationsResult(dtos, source);
    }

    private List<Location> fetchMLSimilarLocations(Location baseLocation, Integer limit) {
        Map<String, Object> payload = buildSimilarPayload(baseLocation, limit);
        MlSearchResponse response = mlServiceClient.findSimilar(payload);
        if (response != null) {
            List<Location> mlLocations = mlResponseMapper.toLocations(response);
            return enrichFromDatabase(mlLocations);
        }
        return Collections.emptyList();
    }

    Map<String, Object> buildSimilarPayload(Location baseLocation, Integer limit) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("name", baseLocation.getName());
        if (baseLocation.getZone() != null && !baseLocation.getZone().isBlank()) {
            payload.put("zone", baseLocation.getZone());
        }
        String locType = resolveLocType(baseLocation);
        if (locType != null && !locType.isBlank()) {
            payload.put("loc_type", locType);
        }
        if (baseLocation.getSummary() != null && !baseLocation.getSummary().isBlank()) {
            payload.put("summary", baseLocation.getSummary());
        }
        if (baseLocation.getTags() != null && !baseLocation.getTags().isBlank()) {
            payload.put("tags", baseLocation.getTags());
        }
        payload.put("limit", limit);
        return payload;
    }

    private String resolveLocType(Location baseLocation) {
        return baseLocation.getType();
    }

    private List<Location> findSimilarByCategory(Location baseLocation, Integer limit) {
        String baseType = baseLocation.getType();
        String baseZone = baseLocation.getZone();

        List<Location> similar = new ArrayList<>();
        
        // Try to find similar locations by type and zone
        if (baseType != null && baseZone != null) {
            similar = locationRepository.findByType(baseType.toLowerCase()).stream()
                    .filter(loc -> baseZone.equalsIgnoreCase(loc.getZone()))
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
