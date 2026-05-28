package com.manhattan.busyness_predictor.service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Collections;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.data.domain.PageRequest;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

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
    private final Cache<String, VibeSearchResponse> searchCache;

    // Cache for busyness data (single logical report entry)
    private final Cache<String, Map<String, Double>> busynessCache;

    // Cache for map data (full corpus or bbox-keyed viewport subsets)
    private final Cache<String, VibeSearchResponse> mapDataCache;

    private static final String BUSYNESS_CACHE_KEY = "report";
    private static final String MAP_DATA_FULL_KEY = "full";
    private static final int COORD_DECIMALS = 4;

    public VibeService(MlServiceClient mlServiceClient,
            LocationRepository locationRepository,
            LocationService locationService,
            MlResponseMapper mlResponseMapper,
            @Value("${app.vibe.search-cache.ttl-seconds:300}") long searchCacheTtlSeconds,
            @Value("${app.vibe.search-cache.max-size:512}") long searchCacheMaxSize,
            @Value("${app.vibe.busyness-cache.ttl-seconds:600}") long busynessCacheTtlSeconds,
            @Value("${app.vibe.map-data-cache.ttl-seconds:300}") long mapDataCacheTtlSeconds,
            @Value("${app.vibe.map-data-cache.max-size:64}") long mapDataCacheMaxSize) {
        this.mlServiceClient = mlServiceClient;
        this.locationRepository = locationRepository;
        this.locationService = locationService;
        this.mlResponseMapper = mlResponseMapper;
        this.searchCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(searchCacheTtlSeconds))
                .maximumSize(searchCacheMaxSize)
                .executor(Runnable::run)
                .build();
        this.busynessCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(busynessCacheTtlSeconds))
                .maximumSize(2)
                .executor(Runnable::run)
                .build();
        this.mapDataCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(mapDataCacheTtlSeconds))
                .maximumSize(mapDataCacheMaxSize)
                .executor(Runnable::run)
                .build();
    }

    // Main entry for vibe search
    public VibeSearchResponse findLocationsByVibe(VibeSearchRequest request) {
        String vibeDescription = request.getVibeDescription();
        Integer maxResults = request.getMaxResults() != null ? request.getMaxResults() : 10;

        // Check cache first
        String cacheKey = generateCacheKey(vibeDescription, maxResults, request.getLocation(), request.getPriceRange());
        VibeSearchResponse cached = searchCache.getIfPresent(cacheKey);
        if (cached != null) {
            logger.info("Returning cached search result for: {}", vibeDescription);
            cached.setBusyness(getLiveBusyness());
            return cached;
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
        searchCache.put(cacheKey, response);
        
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
        return getMapData(null, null, null, null);
    }

    public VibeSearchResponse getMapData(Double minLat, Double maxLat, Double minLng, Double maxLng) {
        boolean bboxActive = minLat != null && maxLat != null && minLng != null && maxLng != null;
        if (bboxActive) {
            validateBbox(minLat, maxLat, minLng, maxLng);
            logger.info("Fetching bbox-filtered locations for map: [{}, {}] x [{}, {}]",
                    minLat, maxLat, minLng, maxLng);
        } else {
            logger.info("Fetching all locations and busyness data for map.");
        }

        String cacheKey = mapDataCacheKey(minLat, maxLat, minLng, maxLng);
        VibeSearchResponse cached = mapDataCache.getIfPresent(cacheKey);
        if (cached != null) {
            logger.info("Using cached map data for key {}", cacheKey);
            return cached;
        }

        List<Location> locations = bboxActive
                ? locationRepository.findByLatBetweenAndLngBetween(minLat, maxLat, minLng, maxLng)
                : locationService.getAllLocations();

        BusynessReportDto busynessReport = mlServiceClient.fetchBusynessReport();
        Map<String, Double> liveBusyness = mlResponseMapper.toPredictions(busynessReport);
        List<Object> forecast = mlResponseMapper.toForecast(busynessReport);

        if (bboxActive) {
            Set<String> returnedZones = locations.stream()
                    .map(Location::getZone)
                    .filter(zone -> zone != null && !zone.isBlank())
                    .collect(Collectors.toSet());
            liveBusyness = filterBusynessByZones(liveBusyness, returnedZones);
            forecast = filterForecastByZones(forecast, returnedZones);
        }

        String explanation = "Complete location data for map view.";
        double confidence = 1.0;

        VibeSearchResponse response = buildResponse(locations, explanation, confidence, liveBusyness, forecast);
        mapDataCache.put(cacheKey, response);
        return response;
    }

    private String mapDataCacheKey(Double minLat, Double maxLat, Double minLng, Double maxLng) {
        if (minLat == null || maxLat == null || minLng == null || maxLng == null) {
            return MAP_DATA_FULL_KEY;
        }
        return String.format("bbox:%s,%s,%s,%s",
                roundCoord(minLat), roundCoord(maxLat), roundCoord(minLng), roundCoord(maxLng));
    }

    private String roundCoord(double value) {
        return String.format("%." + COORD_DECIMALS + "f", value);
    }

    private void validateBbox(Double minLat, Double maxLat, Double minLng, Double maxLng) {
        if (minLat > maxLat || minLng > maxLng) {
            throw new IllegalArgumentException(
                    "bbox: minLat must be <= maxLat and minLng must be <= maxLng");
        }
    }

    private Map<String, Double> filterBusynessByZones(Map<String, Double> busyness, Set<String> zones) {
        if (busyness == null || busyness.isEmpty() || zones.isEmpty()) {
            return busyness != null ? busyness : Collections.emptyMap();
        }
        return busyness.entrySet().stream()
                .filter(entry -> zones.contains(entry.getKey()))
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    @SuppressWarnings("unchecked")
    private List<Object> filterForecastByZones(List<Object> forecast, Set<String> zones) {
        if (forecast == null || forecast.isEmpty() || zones.isEmpty()) {
            return forecast != null ? forecast : Collections.emptyList();
        }
        return forecast.stream()
                .filter(item -> {
                    if (item instanceof Map<?, ?> map) {
                        Object zoneId = map.get("zoneId");
                        if (zoneId == null) {
                            zoneId = map.get("zone");
                        }
                        return zoneId != null && zones.contains(zoneId.toString());
                    }
                    return false;
                })
                .collect(Collectors.toList());
    }

    public Map<String, Double> getLiveBusyness() {
        Map<String, Double> cached = busynessCache.getIfPresent(BUSYNESS_CACHE_KEY);
        if (cached != null) {
            logger.info("Using cached busyness data");
            return new HashMap<>(cached);
        }

        try {
            BusynessReportDto report = mlServiceClient.fetchBusynessReport();
            Map<String, Double> newBusyness = mlResponseMapper.toPredictions(report);
            if (!newBusyness.isEmpty()) {
                busynessCache.put(BUSYNESS_CACHE_KEY, new HashMap<>(newBusyness));
                logger.info("Updated busyness cache with {} entries", newBusyness.size());
                return new HashMap<>(newBusyness);
            }
        } catch (Exception e) {
            logger.error("Failed to fetch busyness data: {}", e.getMessage());
        }

        cached = busynessCache.getIfPresent(BUSYNESS_CACHE_KEY);
        return cached != null ? new HashMap<>(cached) : new HashMap<>();
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
