package com.manhattan.busyness_predictor.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.manhattan.busyness_predictor.dto.LocationDto;
import com.manhattan.busyness_predictor.dto.VibeSearchRequest;
import com.manhattan.busyness_predictor.dto.VibeSearchResponse;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.service.VibeService;
import com.manhattan.busyness_predictor.security.RateLimitService;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.context.annotation.FilterType;
import org.springframework.test.web.servlet.MockMvc;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(value = VibeController.class,
    excludeFilters = @ComponentScan.Filter(
        type = FilterType.ASSIGNABLE_TYPE,
        classes = {
            com.manhattan.busyness_predictor.security.JwtAuthenticationFilter.class,
            com.manhattan.busyness_predictor.security.JwtTokenProvider.class
        }
    )
)
@AutoConfigureMockMvc(addFilters = false)
class VibeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @org.springframework.boot.test.mock.mockito.MockBean
    private VibeService vibeService;

    @org.springframework.boot.test.mock.mockito.MockBean
    private RateLimitService rateLimitService;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void findSimilarLocations_Ok() throws Exception {
        // Prepare sample locations and DTOs
        Location loc1 = new Location();
        loc1.setId(2);
        loc1.setName("Cafe B");
        loc1.setLat(0.0);
        loc1.setLng(0.0);
        loc1.setAddress("123 Main St");
        loc1.setInformation("Info B");
        loc1.setSummary("Summary B");
        loc1.setTags("");
        // Mark as restaurant
        loc1.setIsRestaurant(true);
        LocationDto dto1 = LocationDto.fromLocation(loc1);

        Location loc2 = new Location();
        loc2.setId(3);
        loc2.setName("Bar C");
        loc2.setLat(0.0);
        loc2.setLng(0.0);
        loc2.setAddress("456 Side St");
        loc2.setInformation("Info C");
        loc2.setSummary("Summary C");
        loc2.setTags("");
        // Mark as bar
        loc2.setIsBar(true);
        LocationDto dto2 = LocationDto.fromLocation(loc2);

        // Mock service behavior
        when(vibeService.findSimilarLocations(1, 2))
            .thenReturn(List.of(dto1, dto2));

        // Execute and verify response
        mockMvc.perform(post("/api/vibe/similar")
                .param("locationId", "1")
                .param("limit", "2"))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.message").value("Similar locations found successfully"))
               .andExpect(jsonPath("$.baseLocationId").value(1))
               .andExpect(jsonPath("$.similarLocations[0].id").value(2))
               .andExpect(jsonPath("$.similarLocations[0].name").value("Cafe B"))
               .andExpect(jsonPath("$.similarLocations[0].type").value("Restaurant"))
               .andExpect(jsonPath("$.similarLocations.length()").value(2))
               .andExpect(jsonPath("$.totalResults").value(2));
    }

    @Test
    @DisplayName("Search locations should return search results")
    void searchLocations_ShouldReturnSearchResults() throws Exception {
        // Arrange
        VibeSearchRequest request = new VibeSearchRequest();
        request.setVibeDescription("happy");
        request.setMaxResults(3);

        VibeSearchResponse response = new VibeSearchResponse();
        
        Location loc3 = new Location();
        loc3.setId(4);
        loc3.setName("locA");
        loc3.setLat(40.7128);
        loc3.setLng(-74.0060);
        loc3.setAddress("456 Side St");
        loc3.setInformation("Info C");
        loc3.setSummary("Summary C");
        loc3.setTags("");
        loc3.setIsBar(true);

        Location loc4 = new Location();
        loc4.setId(5);
        loc4.setName("locB");
        loc4.setLat(40.7589);
        loc4.setLng(-73.9851);
        loc4.setAddress("123 Main St");
        loc4.setInformation("Info B");
        loc4.setSummary("Summary B");
        loc4.setTags("");
        loc4.setIsRestaurant(true);

        LocationDto dto1 = LocationDto.fromLocation(loc3);
        LocationDto dto2 = LocationDto.fromLocation(loc4);

        List<LocationDto> results = List.of(dto1, dto2);
        response.setLocations(results);
        response.setExplanation("ML-powered recommendations based on your vibe description");
        response.setConfidence(0.9);

        when(vibeService.findLocationsByVibe(any(VibeSearchRequest.class)))
            .thenReturn(response);

        // Act & Assert
        mockMvc.perform(post("/api/vibe/search")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.locations", hasSize(2)))
            .andExpect(jsonPath("$.locations[0].id").value(4))
            .andExpect(jsonPath("$.locations[0].name").value("locA"))
            .andExpect(jsonPath("$.locations[0].type").value("Bar"))
            .andExpect(jsonPath("$.locations[1].id").value(5))
            .andExpect(jsonPath("$.locations[1].name").value("locB"))
            .andExpect(jsonPath("$.locations[1].type").value("Restaurant"));
    }

    @Test
    @DisplayName("Search rejects maxResults below minimum")
    void searchLocations_ShouldRejectMaxResultsBelowMinimum() throws Exception {
        VibeSearchRequest request = new VibeSearchRequest();
        request.setVibeDescription("happy");
        request.setMaxResults(0);

        mockMvc.perform(post("/api/vibe/search")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest());

        verify(vibeService, never()).findLocationsByVibe(any(VibeSearchRequest.class));
    }

    @Test
    @DisplayName("Search rejects maxResults above maximum")
    void searchLocations_ShouldRejectMaxResultsAboveMaximum() throws Exception {
        VibeSearchRequest request = new VibeSearchRequest();
        request.setVibeDescription("happy");
        request.setMaxResults(26);

        mockMvc.perform(post("/api/vibe/search")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest());

        verify(vibeService, never()).findLocationsByVibe(any(VibeSearchRequest.class));
    }

    @Test
    @DisplayName("Search rejects oversized location filter")
    void searchLocations_ShouldRejectOversizedLocationFilter() throws Exception {
        VibeSearchRequest request = new VibeSearchRequest();
        request.setVibeDescription("happy");
        request.setLocation("x".repeat(101));

        mockMvc.perform(post("/api/vibe/search")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest());

        verify(vibeService, never()).findLocationsByVibe(any(VibeSearchRequest.class));
    }

    @Test
    @DisplayName("Search rejects oversized priceRange filter")
    void searchLocations_ShouldRejectOversizedPriceRange() throws Exception {
        VibeSearchRequest request = new VibeSearchRequest();
        request.setVibeDescription("happy");
        request.setPriceRange("x".repeat(21));

        mockMvc.perform(post("/api/vibe/search")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest());

        verify(vibeService, never()).findLocationsByVibe(any(VibeSearchRequest.class));
    }

    @Test
    @DisplayName("Similar locations rejects limit below minimum")
    void similarLocations_ShouldRejectLimitBelowMinimum() throws Exception {
        mockMvc.perform(post("/api/vibe/similar")
                .param("locationId", "1")
                .param("limit", "0"))
            .andExpect(status().isBadRequest());

        verify(vibeService, never()).findSimilarLocations(any(), any());
    }

    @Test
    @DisplayName("Similar locations rejects limit above maximum")
    void similarLocations_ShouldRejectLimitAboveMaximum() throws Exception {
        mockMvc.perform(post("/api/vibe/similar")
                .param("locationId", "1")
                .param("limit", "26"))
            .andExpect(status().isBadRequest());

        verify(vibeService, never()).findSimilarLocations(any(), any());
    }

    @Test
    @DisplayName("Trending locations should return trending locations")
    void trendingLocations_ShouldReturnTrendingLocations() throws Exception {
        // Arrange
        VibeSearchResponse response = new VibeSearchResponse();
        
        Location loc3 = new Location();
        loc3.setId(4);
        loc3.setName("locA");
        loc3.setLat(40.7128);
        loc3.setLng(-74.0060);
        loc3.setAddress("456 Side St");
        loc3.setInformation("Info C");
        loc3.setSummary("Summary C");
        loc3.setTags("");
        loc3.setIsBar(true);

        Location loc4 = new Location();
        loc4.setId(5);
        loc4.setName("locB");
        loc4.setLat(40.7589);
        loc4.setLng(-73.9851);
        loc4.setAddress("123 Main St");
        loc4.setInformation("Info B");
        loc4.setSummary("Summary B");
        loc4.setTags("");
        loc4.setIsRestaurant(true);

        LocationDto dto1 = LocationDto.fromLocation(loc3);
        LocationDto dto2 = LocationDto.fromLocation(loc4);

        List<LocationDto> trending = List.of(dto1, dto2);

        response.setLocations(trending);
        response.setExplanation("Top 5 trending locations right now.");
        response.setConfidence(0.8);

        when(vibeService.getTrendingWithBusyness())
            .thenReturn(response);

        // Act & Assert
        mockMvc.perform(get("/api/vibe/trending"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.locations", hasSize(2)))
            .andExpect(jsonPath("$.locations[0].id").value(4))
            .andExpect(jsonPath("$.locations[0].name").value("locA"))
            .andExpect(jsonPath("$.locations[0].type").value("Bar"))
            .andExpect(jsonPath("$.locations[1].id").value(5))
            .andExpect(jsonPath("$.locations[1].name").value("locB"))
            .andExpect(jsonPath("$.locations[1].type").value("Restaurant"));
    }

    @Test
    @DisplayName("Map data should return all locations with busyness data")
    void mapData_ShouldReturnMapData() throws Exception {
        // Arrange
        VibeSearchResponse response = new VibeSearchResponse();
        
        Location loc3 = new Location();
        loc3.setId(4);
        loc3.setName("locA");
        loc3.setLat(40.7128);
        loc3.setLng(-74.0060);
        loc3.setAddress("456 Side St");
        loc3.setInformation("Info C");
        loc3.setSummary("Summary C");
        loc3.setTags("");
        loc3.setIsBar(true);

        Location loc4 = new Location();
        loc4.setId(5);
        loc4.setName("locB");
        loc4.setLat(40.7589);
        loc4.setLng(-73.9851);
        loc4.setAddress("123 Main St");
        loc4.setInformation("Info B");
        loc4.setSummary("Summary B");
        loc4.setTags("");
        loc4.setIsRestaurant(true);

        LocationDto dto1 = LocationDto.fromLocation(loc3);
        LocationDto dto2 = LocationDto.fromLocation(loc4);

        List<LocationDto> mapLocs = List.of(dto1, dto2);
        response.setLocations(mapLocs);
        response.setExplanation("Complete location data for map view.");
        response.setConfidence(1.0);
        response.setBusyness(Map.of("zone1", 5.0, "zone2", 3.5));

        when(vibeService.getMapData())
            .thenReturn(response);

        // Act & Assert
        mockMvc.perform(get("/api/vibe/map-data"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.locations", hasSize(2)))
            .andExpect(jsonPath("$.locations[0].id").value(4))
            .andExpect(jsonPath("$.locations[0].name").value("locA"))
            .andExpect(jsonPath("$.locations[0].type").value("Bar"))
            .andExpect(jsonPath("$.locations[1].id").value(5))
            .andExpect(jsonPath("$.locations[1].name").value("locB"))
            .andExpect(jsonPath("$.locations[1].type").value("Restaurant"))
            .andExpect(jsonPath("$.busyness.zone1").value(5.0))
            .andExpect(jsonPath("$.busyness.zone2").value(3.5));
    }
}
