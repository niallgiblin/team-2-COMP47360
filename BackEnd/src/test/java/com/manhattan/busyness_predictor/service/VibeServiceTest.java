package com.manhattan.busyness_predictor.service;

import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.manhattan.busyness_predictor.dto.BusynessReportDto;
import com.manhattan.busyness_predictor.dto.LocationDto;
import com.manhattan.busyness_predictor.dto.MlLocationDto;
import com.manhattan.busyness_predictor.dto.MlSearchResponse;
import com.manhattan.busyness_predictor.dto.SimilarLocationsResult;
import com.manhattan.busyness_predictor.dto.VibeSearchRequest;
import com.manhattan.busyness_predictor.dto.VibeSearchResponse;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.repository.LocationRepository;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
public class VibeServiceTest {

    @Mock
    private MlServiceClient mlServiceClient;

    @Mock
    private LocationRepository locationRepository;

    @Mock
    private LocationService locationService;

    private VibeService vibeService;

    private Location testLocation1;
    private Location testLocation2;
    private VibeSearchRequest searchRequest;
    private ObjectMapper objectMapper;
    private MlResponseMapper mlResponseMapper;

    @BeforeEach
    public void setUp() {
        objectMapper = new ObjectMapper();
        mlResponseMapper = new MlResponseMapper();
        vibeService = new VibeService(
                mlServiceClient,
                locationRepository,
                locationService,
                mlResponseMapper,
                300L,
                512L,
                600L,
                300L,
                64L);

        // Setup test locations
        testLocation1 = new Location();
        testLocation1.setId(1);
        testLocation1.setName("Cozy Coffee Shop");
        testLocation1.setAddress("123 Main St");
        testLocation1.setLat(40.7128);
        testLocation1.setLng(-74.0060);
        testLocation1.setDescription("A warm and cozy coffee shop");
        testLocation1.setIsRestaurant(true);
        testLocation1.setIsBar(false);
        testLocation1.setIsClub(false);
        testLocation1.setIsLandmark(false);
        testLocation1.setPrice(2);
        testLocation1.setReview(4.5f);
        testLocation1.setZone("Downtown");
        testLocation1.setSimilarity(0.85);

        testLocation2 = new Location();
        testLocation2.setId(2);
        testLocation2.setName("Jazz Bar");
        testLocation2.setAddress("456 Jazz Ave");
        testLocation2.setLat(40.7260);
        testLocation2.setLng(-73.9897);
        testLocation2.setDescription("Live jazz music every night");
        testLocation2.setIsRestaurant(false);
        testLocation2.setIsBar(true);
        testLocation2.setIsClub(false);
        testLocation2.setIsLandmark(false);
        testLocation2.setPrice(3);
        testLocation2.setReview(4.2f);
        testLocation2.setZone("Midtown");
        testLocation2.setSimilarity(0.75);

        // Setup search request
        searchRequest = new VibeSearchRequest();
        searchRequest.setVibeDescription("cozy coffee shop with good vibes");
        searchRequest.setMaxResults(10);
    }

    @Test
    void fetchMLRecommendations_usesSearchFixtureShape() throws Exception {
        MlSearchResponse mlResponse = loadSearchFixture("contract-fixtures/llm/search-success.json");

        when(mlServiceClient.search(anyString(), anyInt(), any(), any())).thenReturn(mlResponse);
        when(mlServiceClient.fetchBusynessReport()).thenReturn(null);

        Location blueNote = fixtureLocation(1, "Blue Note Jazz Club");
        Location smalls = fixtureLocation(2, "Smalls Jazz Club");
        when(locationRepository.findById(1)).thenReturn(Optional.of(blueNote));
        when(locationRepository.findById(2)).thenReturn(Optional.of(smalls));

        VibeSearchResponse response = vibeService.findLocationsByVibe(searchRequest);

        assertEquals(2, response.getLocations().size());
        assertEquals("Blue Note Jazz Club", response.getLocations().get(0).getName());
        assertEquals("Smalls Jazz Club", response.getLocations().get(1).getName());
        assertEquals(0.91, response.getConfidence());
    }

    @Test
    void fetchMLSimilarLocations_postsVenueFieldsAndMapsFixture() throws Exception {
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation1));
        when(mlServiceClient.isLlmServiceAvailable()).thenReturn(true);

        MlSearchResponse mlResponse = loadSearchFixture("contract-fixtures/llm/similar-success.json");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);

        when(mlServiceClient.findSimilar(payloadCaptor.capture())).thenReturn(mlResponse);

        Location smalls = fixtureLocation(2, "Smalls Jazz Club");
        Location vanguard = fixtureLocation(3, "Village Vanguard");
        when(locationRepository.findById(2)).thenReturn(Optional.of(smalls));
        when(locationRepository.findById(3)).thenReturn(Optional.of(vanguard));

        SimilarLocationsResult result = vibeService.findSimilarLocations(1, 5);

        assertEquals("ml", result.getSource());
        assertEquals(2, result.getLocations().size());
        assertEquals("Smalls Jazz Club", result.getLocations().get(0).getName());
        assertEquals("Village Vanguard", result.getLocations().get(1).getName());

        Map<String, Object> body = payloadCaptor.getValue();
        assertNotNull(body);
        assertEquals("Cozy Coffee Shop", body.get("name"));
        assertEquals("Downtown", body.get("zone"));
        assertEquals(5, body.get("limit"));
        assertTrue(body.containsKey("loc_type"));
        assertTrue(!body.containsKey("locationId"));
    }

    @Test
    void fetchBusynessReport_mapsMinimalFixture() throws Exception {
        BusynessReportDto report = loadBusynessFixture("contract-fixtures/busyness/report-minimal.json");

        when(mlServiceClient.fetchBusynessReport()).thenReturn(report);

        Map<String, Double> liveBusyness = vibeService.getLiveBusyness();

        assertEquals(2, liveBusyness.size());
        assertEquals(0.72, liveBusyness.get("zone-1"));
        assertEquals(0.45, liveBusyness.get("zone-2"));
    }

    @Test
    public void whenFindLocationsByVibe_withMLServiceAvailable_thenReturnsMLResults() {
        MlSearchResponse mlResponse = mlSearchResponseWithLocation(
                1, "Cozy Coffee Shop", "123 Main St", 40.7128, -74.0060, 0.85);

        when(mlServiceClient.search("cozy coffee shop with good vibes", 10, null, null)).thenReturn(mlResponse);
        when(mlServiceClient.fetchBusynessReport()).thenReturn(null);

        // Mock database lookup for enrichment
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation1));

        // When
        VibeSearchResponse response = vibeService.findLocationsByVibe(searchRequest);

        // Then
        assertNotNull(response);
        assertEquals(1, response.getLocations().size());
        assertEquals("Cozy Coffee Shop", response.getLocations().get(0).getName());
        assertEquals("Found locations using AI-powered semantic search.", response.getExplanation());
        assertEquals(0.85, response.getConfidence());

        verify(mlServiceClient).search("cozy coffee shop with good vibes", 10, null, null);
    }

    @Test
    public void whenFindLocationsByVibe_withFilters_thenForwardsFiltersToMLService() {
        searchRequest.setLocation("Downtown");
        searchRequest.setPriceRange("mid");

        MlSearchResponse mlResponse = mlSearchResponseWithLocation(
                1, "Cozy Coffee Shop", "123 Main St", 40.7128, -74.0060, 0.85);

        when(mlServiceClient.search(anyString(), anyInt(), any(), any())).thenReturn(mlResponse);
        when(mlServiceClient.fetchBusynessReport()).thenReturn(null);
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation1));

        VibeSearchResponse response = vibeService.findLocationsByVibe(searchRequest);

        assertNotNull(response);
        assertEquals(1, response.getLocations().size());
        verify(mlServiceClient).search(
                eq("cozy coffee shop with good vibes"),
                eq(10),
                eq("Downtown"),
                eq("mid"));
    }

    @Test
    public void whenFindLocationsByVibe_withMLServiceUnavailable_thenReturnsEmptyResults() {
        when(mlServiceClient.search(anyString(), anyInt(), any(), any())).thenReturn(null);
        when(mlServiceClient.fetchBusynessReport()).thenReturn(null);

        // When
        VibeSearchResponse response = vibeService.findLocationsByVibe(searchRequest);

        // Then
        assertNotNull(response);
        assertEquals(0, response.getLocations().size());
        assertEquals("Found locations using AI-powered semantic search.", response.getExplanation());
        assertEquals(0.0, response.getConfidence());
    }

    @Test
    public void whenFindLocationsByVibe_withCachedResults_thenReturnsCachedData() {
        MlSearchResponse mlResponse = mlSearchResponseWithLocation(
                1, "Cozy Coffee Shop", null, null, null, 0.85);

        when(mlServiceClient.search(anyString(), anyInt(), any(), any())).thenReturn(mlResponse);
        when(mlServiceClient.fetchBusynessReport()).thenReturn(null);
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation1));

        // First call
        VibeSearchResponse firstResponse = vibeService.findLocationsByVibe(searchRequest);

        // When - Second call with same parameters (should use cache)
        VibeSearchResponse cachedResponse = vibeService.findLocationsByVibe(searchRequest);

        // Then
        assertEquals(firstResponse.getLocations().size(), cachedResponse.getLocations().size());
        assertEquals(firstResponse.getExplanation(), cachedResponse.getExplanation());
        
        // Verify ML service was called only once
        verify(mlServiceClient, times(1)).search(anyString(), anyInt(), any(), any());
    }

    @Test
    public void whenGetTrendingWithBusyness_thenReturnsTrendingLocations() {
        // Given
        List<Location> trendingLocations = Arrays.asList(testLocation1, testLocation2);
        when(locationService.getTrendingLocations()).thenReturn(trendingLocations);
        when(mlServiceClient.fetchBusynessReport()).thenReturn(null);

        // When
        VibeSearchResponse response = vibeService.getTrendingWithBusyness();

        // Then
        assertNotNull(response);
        assertEquals(2, response.getLocations().size());
        assertEquals("Top 5 trending locations right now.", response.getExplanation());
        assertEquals(0.8, response.getConfidence());

        verify(locationService).getTrendingLocations();
    }

    @Test
    public void whenGetMapData_thenReturnsAllLocationsWithBusynessAndForecast() {
        // Given
        List<Location> allLocations = Arrays.asList(testLocation1, testLocation2);
        when(locationService.getAllLocations()).thenReturn(allLocations);
        when(mlServiceClient.fetchBusynessReport()).thenReturn(null);

        // When
        VibeSearchResponse response = vibeService.getMapData();

        // Then
        assertNotNull(response);
        assertEquals(2, response.getLocations().size());
        assertEquals("Complete location data for map view.", response.getExplanation());
        assertEquals(1.0, response.getConfidence());

        verify(locationService).getAllLocations();
    }

    @Test
    void whenGetMapData_withTightBBox_returnsFewerLocationsThanFullCorpus() {
        // D-15: N_full=3 vs N_bbox=1 — tight bbox returns strictly fewer locations than full corpus.
        Location locA = bboxTestLocation(1, "Venue A", 40.755, -73.995, "ZONE_A");
        Location locB = bboxTestLocation(2, "Venue B", 40.800, -73.950, "ZONE_B");
        Location locC = bboxTestLocation(3, "Venue C", 40.700, -74.050, "ZONE_C");
        List<Location> allLocations = Arrays.asList(locA, locB, locC);

        when(locationService.getAllLocations()).thenReturn(allLocations);
        when(locationRepository.findByLatBetweenAndLngBetween(40.75, 40.77, -74.01, -73.99))
                .thenReturn(List.of(locA));
        when(mlServiceClient.fetchBusynessReport()).thenReturn(null);

        VibeSearchResponse fullResponse = vibeService.getMapData();
        int fullCount = fullResponse.getLocations().size();
        assertEquals(3, fullCount);

        VibeSearchResponse boxedResponse = invokeGetMapDataWithBBox(40.75, 40.77, -74.01, -73.99);
        assertEquals(1, boxedResponse.getLocations().size());
        assertTrue(boxedResponse.getLocations().size() < fullCount);
    }

    @Test
    void whenGetMapData_withTightBBox_busynessKeysMatchReturnedZones() {
        Location locA = bboxTestLocation(1, "Venue A", 40.755, -73.995, "ZONE_A");
        Location locB = bboxTestLocation(2, "Venue B", 40.800, -73.950, "ZONE_B");
        Location locC = bboxTestLocation(3, "Venue C", 40.700, -74.050, "ZONE_C");
        List<Location> allLocations = Arrays.asList(locA, locB, locC);

        BusynessReportDto report = new BusynessReportDto();
        report.setPredictions(Map.of("ZONE_A", 0.8, "ZONE_B", 0.6, "ZONE_C", 0.4));

        when(locationService.getAllLocations()).thenReturn(allLocations);
        when(locationRepository.findByLatBetweenAndLngBetween(40.75, 40.77, -74.01, -73.99))
                .thenReturn(List.of(locA));
        when(mlServiceClient.fetchBusynessReport()).thenReturn(report);

        VibeSearchResponse boxedResponse = invokeGetMapDataWithBBox(40.75, 40.77, -74.01, -73.99);

        Set<String> returnedZones = boxedResponse.getLocations().stream()
                .map(LocationDto::getZone)
                .collect(Collectors.toSet());
        Set<String> busynessKeys = boxedResponse.getBusyness().keySet();

        assertTrue(returnedZones.containsAll(busynessKeys));
        assertFalse(busynessKeys.contains("ZONE_B"));
        assertFalse(busynessKeys.contains("ZONE_C"));
    }

    @Test
    void whenGetMapData_withoutBBox_stillReturnsFullCorpus() {
        when(locationService.getAllLocations()).thenReturn(Arrays.asList(testLocation1, testLocation2));
        when(mlServiceClient.fetchBusynessReport()).thenReturn(null);

        VibeSearchResponse response = vibeService.getMapData();

        assertEquals(2, response.getLocations().size());
        assertEquals("Complete location data for map view.", response.getExplanation());
        assertEquals(1.0, response.getConfidence());
    }

    @Test
    public void whenGetMapData_withCachedData_thenReturnsCachedResults() {
        // Caffeine mapDataCache uses "full" key; repeat calls must not re-query getAllLocations.
        // D-15 evidence: full corpus N_full=1 in this fixture; bbox N_bbox=1 in tight-bbox tests above.
        List<Location> allLocations = Arrays.asList(testLocation1);
        when(locationService.getAllLocations()).thenReturn(allLocations);
        when(mlServiceClient.fetchBusynessReport()).thenReturn(null);

        // First call populates mapDataCache with key "full"
        VibeSearchResponse firstResponse = vibeService.getMapData();

        // Second call should hit Caffeine cache
        VibeSearchResponse cachedResponse = vibeService.getMapData();

        assertEquals(firstResponse.getLocations().size(), cachedResponse.getLocations().size());

        verify(locationService, times(1)).getAllLocations();
        verify(mlServiceClient, times(1)).fetchBusynessReport();
    }

    @Test
    public void whenFindSimilarLocations_withValidLocationId_thenReturnsSimilarLocations() {
        // Given
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation1));
        when(mlServiceClient.isLlmServiceAvailable()).thenReturn(true);

        MlSearchResponse mlResponse = mlSearchResponseWithLocation(
                2, "Another Coffee Shop", null, null, null, 0.90);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);

        when(mlServiceClient.findSimilar(payloadCaptor.capture())).thenReturn(mlResponse);

        Location anotherCoffeeShop = new Location();
        anotherCoffeeShop.setId(2);
        anotherCoffeeShop.setName("Another Coffee Shop");
        when(locationRepository.findById(2)).thenReturn(Optional.of(anotherCoffeeShop));

        SimilarLocationsResult result = vibeService.findSimilarLocations(1, 5);

        assertNotNull(result);
        assertEquals("ml", result.getSource());
        assertEquals(1, result.getLocations().size());
        assertEquals("Another Coffee Shop", result.getLocations().get(0).getName());

        Map<String, Object> body = payloadCaptor.getValue();
        assertNotNull(body);
        assertEquals("Cozy Coffee Shop", body.get("name"));
        assertEquals(5, body.get("limit"));
        assertTrue(body.containsKey("zone"));
        assertTrue(body.containsKey("loc_type"));
        assertTrue(!body.containsKey("locationId"));

        verify(locationRepository).findById(1);
    }

    @Test
    public void whenFindSimilarLocations_withInvalidLocationId_thenReturnsEmptyList() {
        // Given
        when(locationRepository.findById(999)).thenReturn(Optional.empty());

        // When
        SimilarLocationsResult result = vibeService.findSimilarLocations(999, 5);

        assertNotNull(result);
        assertTrue(result.getLocations().isEmpty());

        verify(locationRepository).findById(999);
        verify(mlServiceClient, never()).findSimilar(anyMap());
    }

    @Test
    public void whenFindSimilarLocations_withMLServiceDown_thenFallsBackToCategory() {
        // Given - Set up testLocation1 as a restaurant
        testLocation1.setIsRestaurant(true);
        testLocation1.setIsBar(false);
        testLocation1.setIsClub(false);
        testLocation1.setIsLandmark(false);
        
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation1));
        when(mlServiceClient.isLlmServiceAvailable()).thenReturn(false);

        // Setup category-based fallback
        Location similarRestaurant = new Location();
        similarRestaurant.setId(3);
        similarRestaurant.setName("Similar Restaurant");
        similarRestaurant.setIsRestaurant(true);
        similarRestaurant.setZone("Downtown");
        
        // Mock with lowercase "restaurant" as expected by repository
        when(locationRepository.findByType("restaurant"))
                .thenReturn(Arrays.asList(testLocation1, similarRestaurant));

        // When
        SimilarLocationsResult result = vibeService.findSimilarLocations(1, 5);

        assertNotNull(result);
        assertEquals("category", result.getSource());
        assertEquals(1, result.getLocations().size());
        assertEquals("Similar Restaurant", result.getLocations().get(0).getName());

        verify(locationRepository).findByType("restaurant");
    }

    @Test
    public void whenFindSimilarLocations_withCategoryFallback_thenPrefersSameZone() {
        testLocation1.setIsRestaurant(true);
        testLocation1.setZone("Downtown");

        Location otherZoneRestaurant = new Location();
        otherZoneRestaurant.setId(3);
        otherZoneRestaurant.setName("Other Zone Restaurant");
        otherZoneRestaurant.setIsRestaurant(true);
        otherZoneRestaurant.setZone("Midtown");

        Location sameZoneRestaurant = new Location();
        sameZoneRestaurant.setId(4);
        sameZoneRestaurant.setName("Same Zone Restaurant");
        sameZoneRestaurant.setIsRestaurant(true);
        sameZoneRestaurant.setZone("Downtown");

        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation1));
        when(mlServiceClient.isLlmServiceAvailable()).thenReturn(false);
        when(locationRepository.findByType("restaurant"))
                .thenReturn(Arrays.asList(testLocation1, otherZoneRestaurant, sameZoneRestaurant));

        SimilarLocationsResult result = vibeService.findSimilarLocations(1, 5);

        assertEquals("category", result.getSource());
        assertEquals(1, result.getLocations().size());
        assertEquals("Same Zone Restaurant", result.getLocations().get(0).getName());
    }

    @Test
    public void whenGetLiveBusyness_thenReturnsEmptyMap() {
        when(mlServiceClient.fetchBusynessReport()).thenReturn(null);

        // When
        Map<String, Double> liveBusyness = vibeService.getLiveBusyness();

        // Then
        assertNotNull(liveBusyness);
        assertTrue(liveBusyness.isEmpty());
    }

    @Test
    public void whenFindLocationsByVibe_withEmptyMLResponse_thenReturnsEmptyList() {
        MlSearchResponse mlResponse = new MlSearchResponse();
        mlResponse.setResults(Collections.emptyList());

        when(mlServiceClient.search(anyString(), anyInt(), any(), any())).thenReturn(mlResponse);
        when(mlServiceClient.fetchBusynessReport()).thenReturn(null);

        // When
        VibeSearchResponse response = vibeService.findLocationsByVibe(searchRequest);

        // Then
        assertNotNull(response);
        assertEquals(0, response.getLocations().size());
        assertEquals(0.0, response.getConfidence());
    }

    @Test
    public void whenGetLocationById_withValidId_thenReturnsLocation() {
        // Given
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation1));

        // When
        Location location = vibeService.getLocationById(1);

        // Then
        assertNotNull(location);
        assertEquals("Cozy Coffee Shop", location.getName());
        verify(locationRepository).findById(1);
    }

    @Test
    public void whenGetLocationById_withInvalidId_thenReturnsNull() {
        // Given
        when(locationRepository.findById(999)).thenReturn(Optional.empty());

        // When
        Location location = vibeService.getLocationById(999);

        // Then
        assertNull(location);
        verify(locationRepository).findById(999);
    }

    @Test
    void applicationPropertiesExposeVibeSearchCacheDefaults() throws Exception {
        Properties props = new Properties();
        try (InputStream stream = getClass().getClassLoader().getResourceAsStream("application.properties")) {
            assertNotNull(stream, "application.properties must exist");
            props.load(stream);
        }

        assertEquals("${APP_VIBE_SEARCH_CACHE_MAX_SIZE:512}",
                props.getProperty("app.vibe.search-cache.max-size"),
                "Default search cache max size must be 512");
        assertEquals("${APP_VIBE_SEARCH_CACHE_TTL_SECONDS:300}",
                props.getProperty("app.vibe.search-cache.ttl-seconds"),
                "Default search cache TTL must be 300 seconds");
    }

    @Test
    void applicationPropertiesExposeVibeMapDataCacheDefaults() throws Exception {
        Properties props = new Properties();
        try (InputStream stream = getClass().getClassLoader().getResourceAsStream("application.properties")) {
            assertNotNull(stream, "application.properties must exist");
            props.load(stream);
        }

        assertEquals("${APP_VIBE_BUSYNESS_CACHE_TTL_SECONDS:600}",
                props.getProperty("app.vibe.busyness-cache.ttl-seconds"),
                "Default busyness cache TTL must be 600 seconds");
        assertEquals("${APP_VIBE_MAP_DATA_CACHE_TTL_SECONDS:300}",
                props.getProperty("app.vibe.map-data-cache.ttl-seconds"),
                "Default map-data cache TTL must be 300 seconds");
        assertEquals("${APP_VIBE_MAP_DATA_CACHE_MAX_SIZE:64}",
                props.getProperty("app.vibe.map-data-cache.max-size"),
                "Default map-data cache max size must be 64");
    }

    @Test
    void busynessCacheUsesCaffeineNotConcurrentHashMap() throws Exception {
        Field cacheField = VibeService.class.getDeclaredField("busynessCache");
        cacheField.setAccessible(true);
        Object cache = cacheField.get(vibeService);

        assertFalse(cache instanceof ConcurrentHashMap,
                "VibeService busyness cache must use Caffeine, not ConcurrentHashMap");
        assertTrue(cache.getClass().getName().contains("caffeine.cache"),
                "busyness cache implementation must be com.github.benmanes.caffeine.cache.Cache");
    }

    @Test
    void mapDataCacheUsesCaffeineNotConcurrentHashMap() throws Exception {
        Field cacheField = VibeService.class.getDeclaredField("mapDataCache");
        cacheField.setAccessible(true);
        Object cache = cacheField.get(vibeService);

        assertFalse(cache instanceof ConcurrentHashMap,
                "VibeService map-data cache must use Caffeine, not ConcurrentHashMap");
        assertTrue(cache.getClass().getName().contains("caffeine.cache"),
                "map-data cache implementation must be com.github.benmanes.caffeine.cache.Cache");
    }

    @Test
    void mapDataCacheHitsOnRepeatedBboxQuery() {
        Location locA = bboxTestLocation(1, "Venue A", 40.755, -73.995, "ZONE_A");
        when(locationRepository.findByLatBetweenAndLngBetween(40.75, 40.77, -74.01, -73.99))
                .thenReturn(List.of(locA));
        when(mlServiceClient.fetchBusynessReport()).thenReturn(null);

        vibeService.getMapData(40.75, 40.77, -74.01, -73.99);
        vibeService.getMapData(40.75, 40.77, -74.01, -73.99);

        verify(locationRepository, times(1)).findByLatBetweenAndLngBetween(40.75, 40.77, -74.01, -73.99);
        verify(locationService, never()).getAllLocations();
    }

    @Test
    void mapDataCacheDoesNotCrossContaminateBboxKeys() {
        Location locA = bboxTestLocation(1, "Venue A", 40.755, -73.995, "ZONE_A");
        Location locB = bboxTestLocation(2, "Venue B", 40.800, -73.950, "ZONE_B");

        when(locationRepository.findByLatBetweenAndLngBetween(40.75, 40.77, -74.01, -73.99))
                .thenReturn(List.of(locA));
        when(locationRepository.findByLatBetweenAndLngBetween(40.80, 40.80, -73.95, -73.95))
                .thenReturn(List.of(locB));
        when(mlServiceClient.fetchBusynessReport()).thenReturn(null);

        VibeSearchResponse first = vibeService.getMapData(40.75, 40.77, -74.01, -73.99);
        VibeSearchResponse second = vibeService.getMapData(40.80, 40.80, -73.95, -73.95);

        assertEquals(1, first.getLocations().size());
        assertEquals("Venue A", first.getLocations().get(0).getName());
        assertEquals(1, second.getLocations().size());
        assertEquals("Venue B", second.getLocations().get(0).getName());
    }

    @Test
    void searchCacheUsesCaffeineNotConcurrentHashMap() throws Exception {
        Field cacheField = VibeService.class.getDeclaredField("searchCache");
        cacheField.setAccessible(true);
        Object cache = cacheField.get(vibeService);

        assertFalse(cache instanceof ConcurrentHashMap,
                "VibeService search cache must use Caffeine, not ConcurrentHashMap");
        assertTrue(cache.getClass().getName().contains("caffeine.cache"),
                "search cache implementation must be com.github.benmanes.caffeine.cache.Cache");
    }

    @Test
    void configuredSearchCacheHitsMlServiceOnceForIdenticalQueries() throws Exception {
        VibeService configuredService = newVibeServiceWithCachePolicy(300L, 512L, 600L, 300L, 64L);

        MlSearchResponse mlResponse = mlSearchResponseWithLocation(
                1, "Cozy Coffee Shop", "123 Main St", 40.7128, -74.0060, 0.85);
        when(mlServiceClient.search(anyString(), anyInt(), any(), any())).thenReturn(mlResponse);
        when(mlServiceClient.fetchBusynessReport()).thenReturn(null);
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation1));

        configuredService.findLocationsByVibe(searchRequest);
        configuredService.findLocationsByVibe(searchRequest);

        verify(mlServiceClient, times(1)).search(anyString(), anyInt(), any(), any());
    }

    @Test
    void configuredSearchCacheEvictsOldestEntryWhenMaxSizeExceeded() throws Exception {
        VibeService configuredService = newVibeServiceWithCachePolicy(300L, 2L, 600L, 300L, 64L);

        when(mlServiceClient.fetchBusynessReport()).thenReturn(null);
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation1));

        MlSearchResponse first = mlSearchResponseWithLocation(
                1, "First", "123 Main St", 40.7128, -74.0060, 0.85);
        MlSearchResponse second = mlSearchResponseWithLocation(
                1, "Second", "123 Main St", 40.7128, -74.0060, 0.80);
        MlSearchResponse third = mlSearchResponseWithLocation(
                1, "Third", "123 Main St", 40.7128, -74.0060, 0.75);

        when(mlServiceClient.search(eq("query-one"), anyInt(), any(), any())).thenReturn(first);
        when(mlServiceClient.search(eq("query-two"), anyInt(), any(), any())).thenReturn(second);
        when(mlServiceClient.search(eq("query-three"), anyInt(), any(), any())).thenReturn(third);

        VibeSearchRequest firstRequest = new VibeSearchRequest();
        firstRequest.setVibeDescription("query-one");
        firstRequest.setMaxResults(5);

        VibeSearchRequest secondRequest = new VibeSearchRequest();
        secondRequest.setVibeDescription("query-two");
        secondRequest.setMaxResults(5);

        VibeSearchRequest thirdRequest = new VibeSearchRequest();
        thirdRequest.setVibeDescription("query-three");
        thirdRequest.setMaxResults(5);

        configuredService.findLocationsByVibe(firstRequest);
        configuredService.findLocationsByVibe(secondRequest);
        configuredService.findLocationsByVibe(thirdRequest);

        configuredService.findLocationsByVibe(firstRequest);
        configuredService.findLocationsByVibe(secondRequest);
        configuredService.findLocationsByVibe(thirdRequest);

        verify(mlServiceClient, times(1)).search(eq("query-one"), anyInt(), any(), any());
        verify(mlServiceClient, times(2)).search(eq("query-two"), anyInt(), any(), any());
        verify(mlServiceClient, times(2)).search(eq("query-three"), anyInt(), any(), any());
    }

    private VibeService newVibeServiceWithCachePolicy(
            long searchTtlSeconds,
            long searchMaxSize,
            long busynessTtlSeconds,
            long mapDataTtlSeconds,
            long mapDataMaxSize) throws Exception {
        Constructor<VibeService> constructor;
        try {
            constructor = VibeService.class.getConstructor(
                    MlServiceClient.class,
                    LocationRepository.class,
                    LocationService.class,
                    MlResponseMapper.class,
                    long.class,
                    long.class,
                    long.class,
                    long.class,
                    long.class);
        } catch (NoSuchMethodException ex) {
            fail("VibeService must expose cache TTL/max-size constructor for app.vibe.* cache properties");
            return vibeService;
        }

        return constructor.newInstance(
                mlServiceClient,
                locationRepository,
                locationService,
                mlResponseMapper,
                searchTtlSeconds,
                searchMaxSize,
                busynessTtlSeconds,
                mapDataTtlSeconds,
                mapDataMaxSize);
    }

    private MlSearchResponse mlSearchResponseWithLocation(
            int id, String name, String address, Double lat, Double lng, double similarity) {
        MlLocationDto dto = new MlLocationDto();
        dto.setId(id);
        dto.setName(name);
        dto.setAddress(address);
        dto.setLatitude(lat);
        dto.setLongitude(lng);
        dto.setSimilarity(similarity);
        MlSearchResponse response = new MlSearchResponse();
        response.setResults(List.of(dto));
        return response;
    }

    private MlSearchResponse loadSearchFixture(String classpathResource) throws Exception {
        return loadFixture(classpathResource, MlSearchResponse.class);
    }

    private BusynessReportDto loadBusynessFixture(String classpathResource) throws Exception {
        return loadFixture(classpathResource, BusynessReportDto.class);
    }

    private <T> T loadFixture(String classpathResource, Class<T> type) throws Exception {
        InputStream stream = getClass().getClassLoader().getResourceAsStream(classpathResource);
        assertNotNull(stream, "Fixture not found on classpath: " + classpathResource);
        String json = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        return objectMapper.readValue(json, type);
    }

    private Location fixtureLocation(int id, String name) {
        Location location = new Location();
        location.setId(id);
        location.setName(name);
        location.setAddress("fixture address");
        location.setLat(40.7);
        location.setLng(-74.0);
        location.setSimilarity(0.9);
        return location;
    }

    private Location bboxTestLocation(int id, String name, double lat, double lng, String zone) {
        Location location = new Location();
        location.setId(id);
        location.setName(name);
        location.setAddress("bbox test address");
        location.setLat(lat);
        location.setLng(lng);
        location.setZone(zone);
        location.setIsRestaurant(true);
        return location;
    }

    private VibeSearchResponse invokeGetMapDataWithBBox(
            Double minLat, Double maxLat, Double minLng, Double maxLng) {
        return vibeService.getMapData(minLat, maxLat, minLng, maxLng);
    }

}
