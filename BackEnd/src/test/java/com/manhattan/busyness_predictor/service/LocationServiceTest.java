package com.manhattan.busyness_predictor.service;

import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LocationServiceTest {

    @Mock
    private LocationRepository locationRepository;

    @InjectMocks
    private LocationService locationService;

    private Location testLocation1;
    private Location testLocation2;
    private Location testLocation3;

    @BeforeEach
    void setUp() {
        testLocation1 = new Location();
        testLocation1.setId(1);
        testLocation1.setName("Test Restaurant");
        testLocation1.setAddress("123 Test St");
        testLocation1.setLat(40.7589);
        testLocation1.setLng(-73.9851);
        testLocation1.setIsRestaurant(true);
        testLocation1.setIsBar(false);
        testLocation1.setIsClub(false);
        testLocation1.setIsLandmark(false);
        testLocation1.setDescription("A great test restaurant");
        testLocation1.setNumReviews(100);
        testLocation1.setReview(4.5f);
        testLocation1.setPrice(3);
        testLocation1.setZone("Midtown");

        testLocation2 = new Location();
        testLocation2.setId(2);
        testLocation2.setName("Test Bar");
        testLocation2.setAddress("456 Bar Ave");
        testLocation2.setLat(40.7505);
        testLocation2.setLng(-73.9934);
        testLocation2.setIsRestaurant(false);
        testLocation2.setIsBar(true);
        testLocation2.setIsClub(false);
        testLocation2.setIsLandmark(false);
        testLocation2.setDescription("A cool test bar");
        testLocation2.setNumReviews(75);
        testLocation2.setReview(4.2f);
        testLocation2.setPrice(2);
        testLocation2.setZone("Downtown");

        testLocation3 = new Location();
        testLocation3.setId(3);
        testLocation3.setName("Test Landmark");
        testLocation3.setAddress("789 Landmark Blvd");
        testLocation3.setLat(40.7614);
        testLocation3.setLng(-73.9776);
        testLocation3.setIsRestaurant(false);
        testLocation3.setIsBar(false);
        testLocation3.setIsClub(false);
        testLocation3.setIsLandmark(true);
        testLocation3.setDescription("Famous test landmark");
        testLocation3.setNumReviews(200);
        testLocation3.setReview(4.8f);
        testLocation3.setPrice(null);
        testLocation3.setZone("Uptown");
    }

    @Test
    void whenGetAllLocations_thenReturnAllLocations() {
        // Given
        List<Location> allLocations = Arrays.asList(testLocation1, testLocation2, testLocation3);
        when(locationRepository.findAll()).thenReturn(allLocations);

        // When
        List<Location> result = locationService.getAllLocations();

        // Then
        assertEquals(3, result.size());
        assertEquals(allLocations, result);
        verify(locationRepository).findAll();
    }

    @Test
    void whenGetLocationById_withValidId_thenReturnLocation() {
        // Given
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation1));

        // When
        Location result = locationService.getLocationById(1);

        // Then
        assertEquals(testLocation1, result);
        assertEquals(1, result.getId());
        assertEquals("Test Restaurant", result.getName());
        verify(locationRepository).findById(1);
    }

    @Test
    void whenGetLocationById_withInvalidId_thenThrowException() {
        // Given
        when(locationRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> locationService.getLocationById(999));
        assertEquals("Location not found", exception.getMessage());
        verify(locationRepository).findById(999);
    }

    @Test
    void whenGetLocationsByType_withRestaurantType_thenReturnRestaurants() {
        // Given
        List<Location> restaurants = Arrays.asList(testLocation1);
        when(locationRepository.findByType("restaurant")).thenReturn(restaurants);

        // When
        List<Location> result = locationService.getLocationsByType("restaurant");

        // Then
        assertEquals(1, result.size());
        assertEquals(testLocation1, result.get(0));
        assertTrue(result.get(0).getIsRestaurant());
        verify(locationRepository).findByType("restaurant");
    }

    @Test
    void whenGetLocationsByType_withBarType_thenReturnBars() {
        // Given
        List<Location> bars = Arrays.asList(testLocation2);
        when(locationRepository.findByType("bar")).thenReturn(bars);

        // When
        List<Location> result = locationService.getLocationsByType("BAR"); // Test case insensitivity

        // Then
        assertEquals(1, result.size());
        assertEquals(testLocation2, result.get(0));
        assertTrue(result.get(0).getIsBar());
        verify(locationRepository).findByType("bar");
    }

    @Test
    void whenGetLocationsNearby_thenReturnNearbyLocations() {
        // Given
        Double lat = 40.7589;
        Double lng = -73.9851;
        Double radius = 5.0;
        List<Location> nearbyLocations = Arrays.asList(testLocation1, testLocation2);
        when(locationRepository.findNearbyLocations(lat, lng, radius)).thenReturn(nearbyLocations);

        // When
        List<Location> result = locationService.getLocationsNearby(lat, lng, radius);

        // Then
        assertEquals(2, result.size());
        assertTrue(result.contains(testLocation1));
        assertTrue(result.contains(testLocation2));
        verify(locationRepository).findNearbyLocations(lat, lng, radius);
    }

    @Test
    void whenGetNearbyLocationsByType_withType_thenReturnFilteredNearbyLocations() {
        // Given
        Double lat = 40.7589;
        Double lng = -73.9851;
        Double radius = 5.0;
        String type = "restaurant";
        List<Location> nearbyRestaurants = Arrays.asList(testLocation1);
        when(locationRepository.findNearbyLocationsByType(lat, lng, radius, type)).thenReturn(nearbyRestaurants);

        // When
        List<Location> result = locationService.getNearbyLocationsByType(lat, lng, radius, type);

        // Then
        assertEquals(1, result.size());
        assertEquals(testLocation1, result.get(0));
        assertTrue(result.get(0).getIsRestaurant());
        verify(locationRepository).findNearbyLocationsByType(lat, lng, radius, type);
    }

    @Test
    void whenGetNearbyLocationsByType_withNullType_thenReturnAllNearbyLocations() {
        // Given
        Double lat = 40.7589;
        Double lng = -73.9851;
        Double radius = 5.0;
        List<Location> nearbyLocations = Arrays.asList(testLocation1, testLocation2);
        when(locationRepository.findNearbyLocations(lat, lng, radius)).thenReturn(nearbyLocations);

        // When
        List<Location> result = locationService.getNearbyLocationsByType(lat, lng, radius, null);

        // Then
        assertEquals(2, result.size());
        verify(locationRepository).findNearbyLocations(lat, lng, radius);
        verify(locationRepository, never()).findNearbyLocationsByType(any(), any(), any(), any());
    }

    @Test
    void whenGetTrendingLocations_withRecentReviews_thenReturnTrendingLocations() {
        // Given
        List<Location> trendingLocations = Arrays.asList(testLocation3, testLocation1, testLocation2);
        when(locationRepository.findMostReviewedSince(any(LocalDateTime.class))).thenReturn(trendingLocations);

        // When
        List<Location> result = locationService.getTrendingLocations();

        // Then
        assertEquals(3, result.size()); // Limited to 5, but we only have 3
        assertEquals(testLocation3, result.get(0)); // Should be ordered by review count
        verify(locationRepository).findMostReviewedSince(any(LocalDateTime.class));
    }

    @Test
    void whenGetTrendingLocations_withNoRecentReviews_thenReturnTopReviewedAllTime() {
        // Given - No recent reviews
        when(locationRepository.findMostReviewedSince(any(LocalDateTime.class))).thenReturn(Arrays.asList());
        
        // Mock pageable result for all-time most reviewed
        Pageable topFive = PageRequest.of(0, 5, Sort.by(Sort.Direction.DESC, "numReviews"));
        Page<Location> topReviewedPage = new PageImpl<>(Arrays.asList(testLocation3, testLocation1), topFive, 2);
        when(locationRepository.findAll(topFive)).thenReturn(topReviewedPage);

        // When
        List<Location> result = locationService.getTrendingLocations();

        // Then
        assertEquals(2, result.size());
        assertEquals(testLocation3, result.get(0)); // Should have most reviews
        verify(locationRepository).findMostReviewedSince(any(LocalDateTime.class));
        verify(locationRepository).findAll(topFive);
    }

    @Test
    void whenSearchLocations_withInputOnly_thenReturnMatchingLocations() {
        // Given
        String input = "test restaurant";
        Pageable pageable = PageRequest.of(0, 10, Sort.by(Sort.Direction.ASC, "name"));
        Page<Location> searchResults = new PageImpl<>(Arrays.asList(testLocation1));
        
        when(locationRepository.findAll(any(Specification.class), eq(pageable))).thenReturn(searchResults);

        // When
        Page<Location> result = locationService.searchLocations(input, null, null, null, null, null, null, null, null, pageable);

        // Then
        assertEquals(1, result.getTotalElements());
        assertEquals(testLocation1, result.getContent().get(0));
        verify(locationRepository).findAll(any(Specification.class), eq(pageable));
    }

    @Test
    void whenSearchLocations_withTypeFilter_thenReturnFilteredResults() {
        // Given
        String input = null;
        Boolean isRestaurant = true;
        Boolean isBar = null;
        Boolean isClub = null;
        Boolean isLandmark = null;
        Integer maxPrice = null;
        Pageable pageable = PageRequest.of(0, 10, Sort.by(Sort.Direction.ASC, "name"));
        Page<Location> searchResults = new PageImpl<>(Arrays.asList(testLocation1));
        
        when(locationRepository.findAll(any(Specification.class), eq(pageable))).thenReturn(searchResults);

        // When
        Page<Location> result = locationService.searchLocations(input, isRestaurant, isLandmark, isClub, isBar, maxPrice, null, null, null, pageable);

        // Then
        assertEquals(1, result.getTotalElements());
        assertEquals(testLocation1, result.getContent().get(0));
        assertTrue(result.getContent().get(0).getIsRestaurant());
        verify(locationRepository).findAll(any(Specification.class), eq(pageable));
    }

    @Test
    void whenSearchLocations_withPriceFilter_thenReturnFilteredResults() {
        // Given
        String input = null;
        Integer maxPrice = 2;
        Pageable pageable = PageRequest.of(0, 10, Sort.by(Sort.Direction.ASC, "name"));
        Page<Location> searchResults = new PageImpl<>(Arrays.asList(testLocation2));
        
        when(locationRepository.findAll(any(Specification.class), eq(pageable))).thenReturn(searchResults);

        // When
        Page<Location> result = locationService.searchLocations(input, null, null, null, null, maxPrice, null, null, null, pageable);

        // Then
        assertEquals(1, result.getTotalElements());
        assertEquals(testLocation2, result.getContent().get(0));
        assertTrue(result.getContent().get(0).getPrice() <= maxPrice);
        verify(locationRepository).findAll(any(Specification.class), eq(pageable));
    }

    @Test
    void whenSearchLocations_withMultipleFilters_thenReturnFilteredResults() {
        // Given
        String input = "test";
        Boolean isRestaurant = true;
        Integer maxPrice = 3;
        String information = "great";
        String summary = "summary";
        String tags = "tag1";
        Pageable pageable = PageRequest.of(0, 10, Sort.by(Sort.Direction.ASC, "name"));
        Page<Location> searchResults = new PageImpl<>(Arrays.asList(testLocation1));
        
        when(locationRepository.findAll(any(Specification.class), eq(pageable))).thenReturn(searchResults);

        // When
        Page<Location> result = locationService.searchLocations(input, isRestaurant, null, null, null, maxPrice, information, summary, tags, pageable);

        // Then
        assertEquals(1, result.getTotalElements());
        assertEquals(testLocation1, result.getContent().get(0));
        verify(locationRepository).findAll(any(Specification.class), eq(pageable));
    }

    @Test
    void whenSearchLocations_withEmptyInput_thenReturnAllMatchingFilters() {
        // Given
        String input = "";
        Boolean isBar = true;
        Pageable pageable = PageRequest.of(0, 10, Sort.by(Sort.Direction.ASC, "name"));
        Page<Location> searchResults = new PageImpl<>(Arrays.asList(testLocation2));
        
        when(locationRepository.findAll(any(Specification.class), eq(pageable))).thenReturn(searchResults);

        // When
        Page<Location> result = locationService.searchLocations(input, null, null, null, isBar, null, null, null, null, pageable);

        // Then
        assertEquals(1, result.getTotalElements());
        assertEquals(testLocation2, result.getContent().get(0));
        assertTrue(result.getContent().get(0).getIsBar());
        verify(locationRepository).findAll(any(Specification.class), eq(pageable));
    }

    @Test
    void whenSearchLocations_withNoResults_thenReturnEmptyPage() {
        // Given
        String input = "nonexistent";
        Pageable pageable = PageRequest.of(0, 10, Sort.by(Sort.Direction.ASC, "name"));
        Page<Location> emptyResults = new PageImpl<>(Arrays.asList());
        
        when(locationRepository.findAll(any(Specification.class), eq(pageable))).thenReturn(emptyResults);

        // When
        Page<Location> result = locationService.searchLocations(input, null, null, null, null, null, null, null, null, pageable);

        // Then
        assertEquals(0, result.getTotalElements());
        assertTrue(result.getContent().isEmpty());
        verify(locationRepository).findAll(any(Specification.class), eq(pageable));
    }
}