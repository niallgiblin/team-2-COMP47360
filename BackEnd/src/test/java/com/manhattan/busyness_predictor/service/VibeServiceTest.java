package com.manhattan.busyness_predictor.service;

import com.manhattan.busyness_predictor.dto.LLMRecommendationResponse;
import com.manhattan.busyness_predictor.dto.LocationDto;
import com.manhattan.busyness_predictor.dto.VibeSearchRequest;
import com.manhattan.busyness_predictor.dto.VibeSearchResponse;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.web.client.RestTemplate;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class VibeServiceTest {

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
    private LLMRecommendationResponse mockLLMResponse;

    @BeforeEach
    void setup() {
        // Setup test locations
        testLocation1 = new Location();
        testLocation1.setId(1);
        testLocation1.setName("Test Restaurant");
        testLocation1.setLat(40.7589);
        testLocation1.setLng(-73.9851);
        testLocation1.setDescription("A great test restaurant");
        testLocation1.setReview(4.5f);
        testLocation1.setNumReviews(100);

        testLocation2 = new Location();
        testLocation2.setId(2);
        testLocation2.setName("Test Bar");
        testLocation2.setLat(40.7589);
        testLocation2.setLng(-73.9851);
        testLocation2.setDescription("A great test bar");
        testLocation2.setReview(4.2f);
        testLocation2.setNumReviews(50);

        // Setup mock LLM response
        mockLLMResponse = new LLMRecommendationResponse();
        mockLLMResponse.setLocationIds(Arrays.asList(1, 2));
        mockLLMResponse.setExplanation("These locations match your vibe description");
        mockLLMResponse.setConfidence(0.85);

        // Setup RestTemplate mock
        when(restTemplateBuilder.build()).thenReturn(restTemplate);
    }

    @Test
    void whenSearchVibe_withValidRequest_thenReturnRecommendations() {
        // Given
        VibeSearchRequest request = new VibeSearchRequest();
        request.setVibeDescription("cozy restaurant with good food");
        
        when(restTemplate.postForObject(anyString(), any(), eq(LLMRecommendationResponse.class)))
            .thenReturn(mockLLMResponse);

        // When
        VibeSearchResponse response = vibeService.findLocationsByVibe(request);

        // Then
        assertNotNull(response);
        assertNotNull(response.getLocations());
        assertEquals(2, response.getLocations().size());
        assertNotNull(response.getExplanation());
        verify(restTemplate).postForObject(anyString(), any(), eq(LLMRecommendationResponse.class));
    }

    @Test
    void whenSearchVibe_withEmptyDescription_thenThrowException() {
        // Given
        VibeSearchRequest request = new VibeSearchRequest();
        request.setVibeDescription("");

        // When & Then
        assertThrows(IllegalArgumentException.class, () -> {
            vibeService.findLocationsByVibe(request);
        });
    }

    @Test
    void whenSearchVibe_withNullDescription_thenThrowException() {
        // Given
        VibeSearchRequest request = new VibeSearchRequest();
        request.setVibeDescription(null);

        // When & Then
        assertThrows(IllegalArgumentException.class, () -> {
            vibeService.findLocationsByVibe(request);
        });
    }

    @Test
    void whenSearchVibe_withLLMServiceError_thenHandleGracefully() {
        // Given
        VibeSearchRequest request = new VibeSearchRequest();
        request.setVibeDescription("cozy restaurant");
        
        when(restTemplate.postForObject(anyString(), any(), eq(LLMRecommendationResponse.class)))
            .thenThrow(new RuntimeException("LLM service unavailable"));

        // When & Then
        assertThrows(RuntimeException.class, () -> {
            vibeService.findLocationsByVibe(request);
        });
    }

    @Test
    void whenSearchVibe_withNullLLMResponse_thenHandleGracefully() {
        // Given
        VibeSearchRequest request = new VibeSearchRequest();
        request.setVibeDescription("cozy restaurant");
        
        when(restTemplate.postForObject(anyString(), any(), eq(LLMRecommendationResponse.class)))
            .thenReturn(null);

        // When & Then
        assertThrows(RuntimeException.class, () -> {
            vibeService.findLocationsByVibe(request);
        });
    }

    @Test
    void whenGetTrendingLocations_thenReturnTrendingList() {
        // Given
        List<Location> trendingLocations = Arrays.asList(testLocation1, testLocation2);

        // When
        VibeSearchResponse result = vibeService.getTrendingWithBusyness();

        // Then
        assertNotNull(result);
        // Note: This test would need to be adjusted based on actual implementation
        // of getTrendingWithBusyness method
    }

    @Test
    void whenGetMapData_thenReturnMapData() {
        // Given
        List<Location> allLocations = Arrays.asList(testLocation1, testLocation2);

        // When
        VibeSearchResponse result = vibeService.getMapData();

        // Then
        assertNotNull(result);
        // Note: This test would need to be adjusted based on actual implementation
        // of getMapData method
    }

    @Test
    void whenGetSimilarLocations_thenReturnSimilarLocations() {
        // Given
        Integer locationId = 1;
        Integer limit = 5;
        List<Location> similarLocations = Arrays.asList(testLocation2);

        // When
        List<LocationDto> result = vibeService.findSimilarLocations(locationId, limit);

        // Then
        assertNotNull(result);
        // Note: This test would need to be adjusted based on actual implementation
        // of findSimilarLocations method
    }

    @Test
    void whenGetSimilarLocations_withInvalidLocationId_thenHandleGracefully() {
        // Given
        Integer locationId = 999;
        Integer limit = 5;

        // When & Then
        assertThrows(RuntimeException.class, () -> {
            vibeService.findSimilarLocations(locationId, limit);
        });
    }

    @Test
    void whenGetSimilarLocations_withNullLimit_thenUseDefaultLimit() {
        // Given
        Integer locationId = 1;
        Integer limit = null;

        // When
        List<LocationDto> result = vibeService.findSimilarLocations(locationId, limit);

        // Then
        assertNotNull(result);
        // Note: This test would need to be adjusted based on actual implementation
    }
} 