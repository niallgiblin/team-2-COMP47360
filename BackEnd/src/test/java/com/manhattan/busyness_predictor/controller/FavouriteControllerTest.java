package com.manhattan.busyness_predictor.controller;

import com.manhattan.busyness_predictor.dto.FavouriteDto;
import com.manhattan.busyness_predictor.dto.FavouriteRequest;
import com.manhattan.busyness_predictor.model.Favourite;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.security.UserPrincipal;
import com.manhattan.busyness_predictor.service.FavouriteService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.http.MediaType;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(
    controllers = FavouriteController.class,
    excludeFilters = @ComponentScan.Filter(
        type = FilterType.ASSIGNABLE_TYPE,
        classes = {
            com.manhattan.busyness_predictor.security.JwtAuthenticationFilter.class,
            com.manhattan.busyness_predictor.security.JwtTokenProvider.class
        }
    )
)
class FavouriteControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private FavouriteService favouriteService;

    private UserPrincipal testUser;
    private Location testLocation;
    private Favourite testFavourite;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setup() {
        objectMapper = new ObjectMapper();
        
        // Setup test user
        User user = new User();
        user.setId(1);
        user.setUsername("testuser");
        testUser = UserPrincipal.create(user);
        
        // Setup test location
        testLocation = new Location();
        testLocation.setId(1);
        testLocation.setName("Test Venue");
        testLocation.setLat(40.7589);
        testLocation.setLng(-73.9851);
        
        // Setup test favourite
        testFavourite = new Favourite();
        testFavourite.setId(1);
        testFavourite.setUser(user);
        testFavourite.setLocation(testLocation);
        testFavourite.setLikedAt(LocalDateTime.now());
    }

    @Test
    void getFavourites_ShouldReturnUserFavourites() throws Exception {
        // Given
        List<Favourite> favourites = Arrays.asList(testFavourite);
        when(favouriteService.getFavouritesByUser(1)).thenReturn(favourites);

        // When & Then
        mockMvc.perform(get("/api/favourites")
                .with(user(testUser)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].venueId").value(1))
                .andExpect(jsonPath("$[0].userId").value(1));

        verify(favouriteService).getFavouritesByUser(1);
    }

    @Test
    void getFavourites_WhenNoFavourites_ShouldReturnEmptyList() throws Exception {
        // Given
        when(favouriteService.getFavouritesByUser(1)).thenReturn(Arrays.asList());

        // When & Then
        mockMvc.perform(get("/api/favourites")
                .with(user(testUser)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));

        verify(favouriteService).getFavouritesByUser(1);
    }

    @Test
    void likeVenue_ShouldAddFavourite() throws Exception {
        // Given
        FavouriteRequest request = new FavouriteRequest();
        request.setVenueId(1);
        
        when(favouriteService.addFavourite(1, 1)).thenReturn(testFavourite);

        // When & Then
        mockMvc.perform(post("/api/favourites")
                .with(user(testUser))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.venueId").value(1))
                .andExpect(jsonPath("$.userId").value(1));

        verify(favouriteService).addFavourite(1, 1);
    }

    @Test
    void likeVenue_WithInvalidRequest_ShouldReturnBadRequest() throws Exception {
        // Given
        FavouriteRequest request = new FavouriteRequest();
        // Missing venueId

        // When & Then
        mockMvc.perform(post("/api/favourites")
                .with(user(testUser))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unlikeVenue_ShouldRemoveFavourite() throws Exception {
        // Given
        doNothing().when(favouriteService).removeFavourite(1, 1);

        // When & Then
        mockMvc.perform(delete("/api/favourites/1")
                .with(user(testUser)))
                .andExpect(status().isNoContent());

        verify(favouriteService).removeFavourite(1, 1);
    }

    @Test
    void unlikeVenue_WithInvalidVenueId_ShouldReturnBadRequest() throws Exception {
        // Given
        doThrow(new RuntimeException("Venue not found")).when(favouriteService).removeFavourite(1, 999);

        // When & Then
        mockMvc.perform(delete("/api/favourites/999")
                .with(user(testUser)))
                .andExpect(status().isInternalServerError());
    }

    @Test
    void getFavourites_WithoutAuthentication_ShouldReturnUnauthorized() throws Exception {
        // When & Then
        mockMvc.perform(get("/api/favourites"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void likeVenue_WithoutAuthentication_ShouldReturnUnauthorized() throws Exception {
        // Given
        FavouriteRequest request = new FavouriteRequest();
        request.setVenueId(1);

        // When & Then
        mockMvc.perform(post("/api/favourites")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unlikeVenue_WithoutAuthentication_ShouldReturnUnauthorized() throws Exception {
        // When & Then
        mockMvc.perform(delete("/api/favourites/1"))
                .andExpect(status().isUnauthorized());
    }
} 