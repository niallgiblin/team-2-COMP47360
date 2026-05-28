package com.manhattan.busyness_predictor.controller;

import com.manhattan.busyness_predictor.dto.LocationDto;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.security.RateLimitService;
import com.manhattan.busyness_predictor.service.HistoryService;
import com.manhattan.busyness_predictor.service.LocationService;
import com.manhattan.busyness_predictor.service.ReviewService;
import com.manhattan.busyness_predictor.service.SharedService;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.when;
import org.springframework.boot.test.mock.mockito.MockBean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;


import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;


@WebMvcTest(
    controllers = LocationController.class,
    excludeFilters = @ComponentScan.Filter(
        type = FilterType.ASSIGNABLE_TYPE,
        classes = {
            com.manhattan.busyness_predictor.security.JwtAuthenticationFilter.class,
            com.manhattan.busyness_predictor.security.JwtTokenProvider.class
        }
    )
)
@AutoConfigureMockMvc(addFilters = false)
class LocationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private LocationService locationService;

    @MockBean 
    private ReviewService reviewService;

    @MockBean
    private SharedService sharedService;

    @MockBean
    private RateLimitService rateLimitService;

    @MockBean
    private HistoryService historyService;

    private Location sample;

    @BeforeEach
    void setup() {
        sample = new Location();
        sample.setId(77);
        sample.setName("Spot 77");
        sample.setLat(12.34);
        sample.setLng(56.78);
    }

    @Test
    void getLocationDetails_ShouldReturnLocationAndBusyness() throws Exception {
        when(locationService.getLocationById(77)).thenReturn(sample);

        mockMvc.perform(get("/api/locations/{id}", 77))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.location.id").value(77))
               .andExpect(jsonPath("$.location.name").value("Spot 77"))
               .andExpect(jsonPath("$.location.lat").value(12.34))
               .andExpect(jsonPath("$.location.lng").value(56.78))
               .andExpect(jsonPath("$.busyness").value("Coming soon"));
    }

    @Test
    void getTrendingLocations_ShouldReturnList() throws Exception {
        Location one = new Location();
        one.setId(1);
        one.setName("One");
        one.setLat(10.0);
        one.setLng(20.0);

        Location two = new Location();
        two.setId(2);
        two.setName("Two");
        two.setLat(30.0);
        two.setLng(40.0);

        when(locationService.getTrendingLocations()).thenReturn(List.of(one, two));

        mockMvc.perform(get("/api/locations/trending"))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$[0].id").value(1))
               .andExpect(jsonPath("$[0].name").value("One"))
               .andExpect(jsonPath("$[1].id").value(2))
               .andExpect(jsonPath("$[1].name").value("Two"));
    }

    @Test
    void searchLocations_ShouldReturnPagedResults() throws Exception {
        Location a = new Location();
        a.setId(1);
        a.setName("Place One");
        a.setLat(11.1);
        a.setLng(22.2);

        Location b = new Location();
        b.setId(2);
        b.setName("Place Two");
        b.setLat(33.3);
        b.setLng(44.4);

        // page=1, size=2
        var pageable = PageRequest.of(1, 2, Sort.by(Sort.Direction.DESC, "name"));
        var pageImpl = new PageImpl<>(List.of(a, b), pageable, 4);

        when(locationService.searchLocations(
                eq("foo"), eq(true), eq(false), eq(false), eq(true),
                eq(5), eq("info"), eq("sum"), eq("tag"),
                any(Pageable.class))
        ).thenReturn(pageImpl);

        mockMvc.perform(get("/api/locations/search")
                .param("input", "foo")
                .param("isRestaurant", "true")
                .param("isLandmark", "false")
                .param("isClub", "false")
                .param("isBar", "true")
                .param("maxPrice", "5")
                .param("information", "info")
                .param("summary", "sum")
                .param("tags", "tag")
                .param("page", "1")
                .param("size", "2")
                .param("sort", "name")
                .param("direction", "desc")
        )
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content[0].id").value(1))
        .andExpect(jsonPath("$.content[1].id").value(2))
        .andExpect(jsonPath("$.number").value(1))
        .andExpect(jsonPath("$.size").value(2))
        .andExpect(jsonPath("$.totalElements").value(4));
    }
}
