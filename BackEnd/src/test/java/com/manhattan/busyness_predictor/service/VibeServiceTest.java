package com.manhattan.busyness_predictor.service;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import com.manhattan.busyness_predictor.dto.LocationDto;
import com.manhattan.busyness_predictor.dto.MlLocationDto;
import com.manhattan.busyness_predictor.dto.MlSearchResponse;
import com.manhattan.busyness_predictor.dto.SimilarLocationsResult;
import com.manhattan.busyness_predictor.dto.VibeSearchRequest;
import com.manhattan.busyness_predictor.dto.VibeSearchResponse;
import com.manhattan.busyness_predictor.service.MlResponseMapper;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.repository.LocationRepository;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
public class VibeServiceTest {

    @Mock
    private RestTemplate restTemplate;

    @Mock
    private RestTemplateBuilder restTemplateBuilder;

    @Mock
    private LocationRepository locationRepository;

    @Mock
    private LocationService locationService;

    @InjectMocks
    private VibeService vibeService;

    private Location testLocation1;
    private Location testLocation2;
    private VibeSearchRequest searchRequest;

    @BeforeEach
    public void setUp() {
        // Initialize with RestTemplateBuilder mock
        when(restTemplateBuilder.build()).thenReturn(restTemplate);
        vibeService = new VibeService(
                restTemplateBuilder,
                locationRepository,
                locationService,
                new MlResponseMapper());
        
        // Set the service URLs using reflection
        ReflectionTestUtils.setField(vibeService, "llmServiceUrl", "http://llm-service:5000");
        ReflectionTestUtils.setField(vibeService, "busynessServiceUrl", "http://busyness-service:5000");

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
    public void whenFindLocationsByVibe_withMLServiceAvailable_thenReturnsMLResults() {
        MlSearchResponse mlResponse = mlSearchResponseWithLocation(
                1, "Cozy Coffee Shop", "123 Main St", 40.7128, -74.0060, 0.85);

        when(restTemplate.exchange(
                eq("http://llm-service:5000/search"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(MlSearchResponse.class)))
                .thenReturn(ResponseEntity.ok(mlResponse));

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

        verify(restTemplate).exchange(
                eq("http://llm-service:5000/search"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(MlSearchResponse.class));
    }

    @Test
    public void whenFindLocationsByVibe_withMLServiceUnavailable_thenReturnsEmptyResults() {
        when(restTemplate.exchange(
                eq("http://llm-service:5000/search"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(MlSearchResponse.class)))
                .thenThrow(new RestClientException("Connection refused"));

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

        when(restTemplate.exchange(
                eq("http://llm-service:5000/search"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(MlSearchResponse.class)))
                .thenReturn(ResponseEntity.ok(mlResponse));

        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation1));

        // First call
        VibeSearchResponse firstResponse = vibeService.findLocationsByVibe(searchRequest);

        // When - Second call with same parameters (should use cache)
        VibeSearchResponse cachedResponse = vibeService.findLocationsByVibe(searchRequest);

        // Then
        assertEquals(firstResponse.getLocations().size(), cachedResponse.getLocations().size());
        assertEquals(firstResponse.getExplanation(), cachedResponse.getExplanation());
        
        // Verify ML service was called only once
        verify(restTemplate, times(1)).exchange(
                eq("http://llm-service:5000/search"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(MlSearchResponse.class));
    }

    @Test
    public void whenGetTrendingWithBusyness_thenReturnsTrendingLocations() {
        // Given
        List<Location> trendingLocations = Arrays.asList(testLocation1, testLocation2);
        when(locationService.getTrendingLocations()).thenReturn(trendingLocations);

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
    public void whenGetMapData_withCachedData_thenReturnsCachedResults() {
        // Given - First call to populate cache
        List<Location> allLocations = Arrays.asList(testLocation1);
        when(locationService.getAllLocations()).thenReturn(allLocations);

        // First call
        VibeSearchResponse firstResponse = vibeService.getMapData();

        // When - Second call (should use cache)
        VibeSearchResponse cachedResponse = vibeService.getMapData();

        // Then
        assertEquals(firstResponse.getLocations().size(), cachedResponse.getLocations().size());

        // Verify services were called only once
        verify(locationService, times(1)).getAllLocations();
    }

    @Test
    public void whenFindSimilarLocations_withValidLocationId_thenReturnsSimilarLocations() {
        // Given
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation1));

        // Mock ML service health check
        when(restTemplate.getForEntity("http://llm-service:5000/health", String.class))
                .thenReturn(ResponseEntity.ok("OK"));

        MlSearchResponse mlResponse = mlSearchResponseWithLocation(
                2, "Another Coffee Shop", null, null, null, 0.90);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<HttpEntity<Map<String, Object>>> entityCaptor =
                ArgumentCaptor.forClass(HttpEntity.class);

        when(restTemplate.exchange(
                eq("http://llm-service:5000/similar"),
                eq(HttpMethod.POST),
                entityCaptor.capture(),
                eq(MlSearchResponse.class)))
                .thenReturn(ResponseEntity.ok(mlResponse));

        Location anotherCoffeeShop = new Location();
        anotherCoffeeShop.setId(2);
        anotherCoffeeShop.setName("Another Coffee Shop");
        when(locationRepository.findById(2)).thenReturn(Optional.of(anotherCoffeeShop));

        SimilarLocationsResult result = vibeService.findSimilarLocations(1, 5);

        assertNotNull(result);
        assertEquals("ml", result.getSource());
        assertEquals(1, result.getLocations().size());
        assertEquals("Another Coffee Shop", result.getLocations().get(0).getName());

        Map<String, Object> body = entityCaptor.getValue().getBody();
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
        verify(restTemplate, never()).exchange(
                eq("http://llm-service:5000/similar"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(MlSearchResponse.class));
    }

    @Test
    public void whenFindSimilarLocations_withMLServiceDown_thenFallsBackToCategory() {
        // Given - Set up testLocation1 as a restaurant
        testLocation1.setIsRestaurant(true);
        testLocation1.setIsBar(false);
        testLocation1.setIsClub(false);
        testLocation1.setIsLandmark(false);
        
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation1));

        // ML service is down
        when(restTemplate.getForEntity("http://llm-service:5000/health", String.class))
                .thenThrow(new RestClientException("Service unavailable"));

        // Setup category-based fallback
        Location similarRestaurant = new Location();
        similarRestaurant.setId(3);
        similarRestaurant.setName("Similar Restaurant");
        similarRestaurant.setIsRestaurant(true);
        
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
    public void whenGetLiveBusyness_thenReturnsEmptyMap() {
        // Given - The service always tries to fetch but fails

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

        when(restTemplate.exchange(
                eq("http://llm-service:5000/search"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(MlSearchResponse.class)))
                .thenReturn(ResponseEntity.ok(mlResponse));

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

}

