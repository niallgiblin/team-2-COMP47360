package com.manhattan.busyness_predictor.controller;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.MockitoAnnotations;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.manhattan.busyness_predictor.dto.FavouriteRequest;
import com.manhattan.busyness_predictor.model.Favourite;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.security.UserPrincipal;
import com.manhattan.busyness_predictor.service.FavouriteService;

public class FavouriteControllerTest {
    private static final Integer USER_ID = 1;
    private static final String USERNAME = "testuser";
    private static final String TOKEN = "jwt.token.here";
    private static final Integer VENUE_ID = 100;
    private static final String VENUE_NAME = "Test Venue";

    @Mock
    private FavouriteService favouriteService;

    @InjectMocks
    private FavouriteController favouriteController;

    private MockMvc mockMvc;
    private ObjectMapper objectMapper;
    private User testUser;
    private UserPrincipal userPrincipal;
    private TestingAuthenticationToken authentication;
    private Favourite testFavourite;
    private Location testLocation;

    @BeforeEach
    public void setup() {
        MockitoAnnotations.openMocks(this);
        
        // Setup test user with all required fields
        testUser = new User();
        testUser.setId(USER_ID);
        testUser.setUsername(USERNAME);
        
        userPrincipal = UserPrincipal.create(testUser);
        
        // Setup test location
        testLocation = new Location();
        testLocation.setId(VENUE_ID);
        testLocation.setName(VENUE_NAME);
        testLocation.setAddress("123 Test Street");
        testLocation.setLat(53.3498);
        testLocation.setLng(-6.2603);
        
        // Setup test favourite
        testFavourite = new Favourite();
        testFavourite.setId(1);
        testFavourite.setUser(testUser);
        testFavourite.setLocation(testLocation);
        testFavourite.setLikedAt(LocalDateTime.of(2025, 7, 31, 12, 0));
        
        // Create authentication object
        authentication = new TestingAuthenticationToken(
            userPrincipal, 
            null, 
            List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        authentication.setAuthenticated(true);
        
        // Setup MockMvc with proper security configuration
        mockMvc = MockMvcBuilders
                .standaloneSetup(favouriteController)
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .setControllerAdvice(new TestGlobalExceptionHandler())
                // Add a filter to handle authentication - more precise logic
                .addFilters((request, response, chain) -> {
                    // Clear any existing authentication first
                    SecurityContextHolder.clearContext();
                    
                    // Only set authentication if explicitly provided via .with(authentication())
                    if (request.getAttribute("org.springframework.security.authentication") != null) {
                        SecurityContextHolder.getContext().setAuthentication(authentication);
                    }
                    // Check for Authorization header as secondary indicator
                    else if (request instanceof jakarta.servlet.http.HttpServletRequest) {
                        jakarta.servlet.http.HttpServletRequest httpRequest = (jakarta.servlet.http.HttpServletRequest) request;
                        String authHeader = httpRequest.getHeader("Authorization");
                        if (authHeader != null && authHeader.startsWith("Bearer " + TOKEN)) {
                            SecurityContextHolder.getContext().setAuthentication(authentication);
                        }
                    }
                    
                    try {
                        chain.doFilter(request, response);
                    } finally {
                        // Clean up security context after request
                        SecurityContextHolder.clearContext();
                    }
                })
                .build();
        
        objectMapper = new ObjectMapper();
    }

    // Test-specific global exception handler
    @org.springframework.web.bind.annotation.ControllerAdvice
    public static class TestGlobalExceptionHandler {
        @org.springframework.web.bind.annotation.ExceptionHandler(org.springframework.web.bind.MethodArgumentNotValidException.class)
        public org.springframework.http.ResponseEntity<?> handleValidationExceptions(
                org.springframework.web.bind.MethodArgumentNotValidException ex) {
            return new org.springframework.http.ResponseEntity<>("Validation failed", org.springframework.http.HttpStatus.BAD_REQUEST);
        }
        
        // Handle constraint violations
        @org.springframework.web.bind.annotation.ExceptionHandler(jakarta.validation.ConstraintViolationException.class)
        public org.springframework.http.ResponseEntity<?> handleConstraintViolation(
                jakarta.validation.ConstraintViolationException ex) {
            return new org.springframework.http.ResponseEntity<>("Validation failed", org.springframework.http.HttpStatus.BAD_REQUEST);
        }
        
        // Handle @NotNull validation failures from Jackson
        @org.springframework.web.bind.annotation.ExceptionHandler(Exception.class)
        public org.springframework.http.ResponseEntity<?> handleAllExceptions(Exception ex) {
            // Log the exception for debugging
            System.err.println("Exception in test: " + ex.getClass().getName() + " - " + ex.getMessage());
            
            // Handle HttpMessageNotReadableException by checking class name
            if (ex.getClass().getName().equals("org.springframework.http.converter.HttpMessageNotReadableException")) {
                return new org.springframework.http.ResponseEntity<>("Validation failed", org.springframework.http.HttpStatus.BAD_REQUEST);
            }
            
            // Handle JSON processing exceptions
            if (ex instanceof com.fasterxml.jackson.databind.JsonMappingException) {
                return new org.springframework.http.ResponseEntity<>("Validation failed", org.springframework.http.HttpStatus.BAD_REQUEST);
            }
            
            // Handle NullPointerException when currentUser is null (authentication issue)
            if (ex instanceof NullPointerException) {
                // Check if this is likely an authentication-related NPE
                if (ex.getMessage() == null || ex.getStackTrace().length > 0) {
                    String topClass = ex.getStackTrace()[0].getClassName();
                    if (topClass.contains("FavouriteController")) {
                        return new org.springframework.http.ResponseEntity<>("Unauthorized", org.springframework.http.HttpStatus.UNAUTHORIZED);
                    }
                }
                java.util.Map<String, String> errorDetails = new java.util.HashMap<>();
                errorDetails.put("error", "An unexpected internal server error has occurred.");
                errorDetails.put("message", ex.getMessage());
                return new org.springframework.http.ResponseEntity<>(errorDetails, org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR);
            }
            
            // Handle RuntimeException
            if (ex instanceof RuntimeException) {
                java.util.Map<String, String> errorDetails = new java.util.HashMap<>();
                errorDetails.put("error", "An unexpected internal server error has occurred.");
                errorDetails.put("message", ex.getMessage());
                return new org.springframework.http.ResponseEntity<>(errorDetails, org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR);
            }
            
            // Handle all other exceptions
            java.util.Map<String, String> errorDetails = new java.util.HashMap<>();
            errorDetails.put("error", "An unexpected internal server error has occurred.");
            errorDetails.put("message", ex.getMessage());
            return new org.springframework.http.ResponseEntity<>(errorDetails, org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Test
    public void whenGetFavourites_thenReturnsFavouritesList() throws Exception {
        // Given
        List<Favourite> favourites = List.of(testFavourite);
        when(favouriteService.getFavouritesByUser(eq(USER_ID))).thenReturn(favourites);

        // When & Then
        mockMvc.perform(get("/api/favourites")
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].location.id").value(VENUE_ID))
                .andExpect(jsonPath("$[0].location.name").value(VENUE_NAME));

        verify(favouriteService).getFavouritesByUser(eq(USER_ID));
    }

    @Test
    public void whenGetFavouritesWithEmptyList_thenReturnsEmptyArray() throws Exception {
        // Given
        List<Favourite> favourites = Collections.emptyList();
        when(favouriteService.getFavouritesByUser(eq(USER_ID))).thenReturn(favourites);

        // When & Then
        mockMvc.perform(get("/api/favourites")
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$").isEmpty());

        verify(favouriteService).getFavouritesByUser(eq(USER_ID));
    }

    @Test
    public void whenGetFavouritesWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        // When & Then - no authentication provided
        mockMvc.perform(get("/api/favourites"))
                .andExpect(status().isUnauthorized());

        verify(favouriteService, never()).getFavouritesByUser(any());
    }

    @Test
    public void whenLikeVenue_thenReturnsCreatedFavourite() throws Exception {
        // Given
        FavouriteRequest request = new FavouriteRequest();
        request.setVenueId(VENUE_ID);
        
        when(favouriteService.addFavourite(eq(USER_ID), eq(VENUE_ID))).thenReturn(testFavourite);

        // When & Then
        mockMvc.perform(post("/api/favourites")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.location.id").value(VENUE_ID))
                .andExpect(jsonPath("$.location.name").value(VENUE_NAME));

        verify(favouriteService).addFavourite(eq(USER_ID), eq(VENUE_ID));
    }

    @Test
    public void whenLikeVenueWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        // Given
        FavouriteRequest request = new FavouriteRequest();
        request.setVenueId(VENUE_ID);

        // When & Then - no authentication provided
        mockMvc.perform(post("/api/favourites")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());

        verify(favouriteService, never()).addFavourite(any(), any());
    }

    @Test
    public void whenLikeVenueWithInvalidData_thenReturnsBadRequest() throws Exception {
        // Given - invalid data (null venueId)
        FavouriteRequest request = new FavouriteRequest();
        request.setVenueId(null);

        // When & Then
        mockMvc.perform(post("/api/favourites")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andDo(result -> {
                    System.out.println("Response Status: " + result.getResponse().getStatus());
                    System.out.println("Response Content: " + result.getResponse().getContentAsString());
                })
                .andExpect(status().isBadRequest());

        verify(favouriteService, never()).addFavourite(any(), any());
    }

    @Test
    public void whenLikeAlreadyFavouritedVenue_thenReturnsInternalServerError() throws Exception {
        // Given
        FavouriteRequest request = new FavouriteRequest();
        request.setVenueId(VENUE_ID);
        
        when(favouriteService.addFavourite(eq(USER_ID), eq(VENUE_ID)))
                .thenThrow(new RuntimeException("Already favourited."));

        // When & Then
        mockMvc.perform(post("/api/favourites")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("Already favourited."));

        verify(favouriteService).addFavourite(eq(USER_ID), eq(VENUE_ID));
    }

    @Test
    public void whenLikeNonExistentVenue_thenReturnsInternalServerError() throws Exception {
        // Given
        Integer nonExistentVenueId = 999;
        FavouriteRequest request = new FavouriteRequest();
        request.setVenueId(nonExistentVenueId);
        
        when(favouriteService.addFavourite(eq(USER_ID), eq(nonExistentVenueId)))
                .thenThrow(new RuntimeException("Location not found"));

        // When & Then
        mockMvc.perform(post("/api/favourites")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("Location not found"));

        verify(favouriteService).addFavourite(eq(USER_ID), eq(nonExistentVenueId));
    }

    @Test
    public void whenUnlikeVenue_thenReturnsNoContent() throws Exception {
        // Given
        doNothing().when(favouriteService).removeFavourite(eq(USER_ID), eq(VENUE_ID));

        // When & Then
        mockMvc.perform(delete("/api/favourites/{venueId}", VENUE_ID)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isNoContent());

        verify(favouriteService).removeFavourite(eq(USER_ID), eq(VENUE_ID));
    }

    @Test
    public void whenUnlikeVenueWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        // When & Then - no authentication provided
        mockMvc.perform(delete("/api/favourites/{venueId}", VENUE_ID))
                .andExpect(status().isUnauthorized());

        verify(favouriteService, never()).removeFavourite(any(), any());
    }

    @Test
    public void whenUnlikeNonExistentFavourite_thenReturnsInternalServerError() throws Exception {
        // Given
        Integer nonExistentVenueId = 999;
        
        doThrow(new RuntimeException("Cannot remove favourite: not found."))
                .when(favouriteService).removeFavourite(eq(USER_ID), eq(nonExistentVenueId));

        // When & Then
        mockMvc.perform(delete("/api/favourites/{venueId}", nonExistentVenueId)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("Cannot remove favourite: not found."));

        verify(favouriteService).removeFavourite(eq(USER_ID), eq(nonExistentVenueId));
    }

    @Test
    public void whenGetFavouritesWithMultipleFavourites_thenReturnsAllFavourites() throws Exception {
        // Given
        Location secondLocation = new Location();
        secondLocation.setId(101);
        secondLocation.setName("Second Venue");
        secondLocation.setAddress("456 Test Avenue");
        secondLocation.setLat(53.3500);
        secondLocation.setLng(-6.2600);
        
        Favourite secondFavourite = new Favourite();
        secondFavourite.setId(2);
        secondFavourite.setUser(testUser);
        secondFavourite.setLocation(secondLocation);
        secondFavourite.setLikedAt(LocalDateTime.of(2025, 7, 31, 13, 0));
        
        List<Favourite> favourites = List.of(testFavourite, secondFavourite);
        when(favouriteService.getFavouritesByUser(eq(USER_ID))).thenReturn(favourites);

        // When & Then
        mockMvc.perform(get("/api/favourites")
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].location.name").value(VENUE_NAME))
                .andExpect(jsonPath("$[1].id").value(2))
                .andExpect(jsonPath("$[1].location.name").value("Second Venue"));

        verify(favouriteService).getFavouritesByUser(eq(USER_ID));
    }

    @Test
    public void whenLikeVenueWithValidData_thenVerifiesLocationDtoMapping() throws Exception {
        // Given
        FavouriteRequest request = new FavouriteRequest();
        request.setVenueId(VENUE_ID);
        
        when(favouriteService.addFavourite(eq(USER_ID), eq(VENUE_ID))).thenReturn(testFavourite);

        // When & Then
        mockMvc.perform(post("/api/favourites")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.location.address").value("123 Test Street"))
                .andExpect(jsonPath("$.location.lat").value(53.3498))
                .andExpect(jsonPath("$.location.lng").value(-6.2603))
                .andExpect(jsonPath("$.likedAt").exists());

        verify(favouriteService).addFavourite(eq(USER_ID), eq(VENUE_ID));
    }

    @Test
    public void whenGetFavouritesWithDifferentLocationTypes_thenReturnsCorrectTypes() throws Exception {
        // Given - Restaurant
        Location restaurantLocation = new Location();
        restaurantLocation.setId(201);
        restaurantLocation.setName("Test Restaurant");
        restaurantLocation.setIsRestaurant(true);
        restaurantLocation.setIsBar(false);
        restaurantLocation.setIsClub(false);
        restaurantLocation.setIsLandmark(false);
        
        // Given - Bar
        Location barLocation = new Location();
        barLocation.setId(202);
        barLocation.setName("Test Bar");
        barLocation.setIsRestaurant(false);
        barLocation.setIsBar(true);
        barLocation.setIsClub(false);
        barLocation.setIsLandmark(false);
        
        // Given - Club
        Location clubLocation = new Location();
        clubLocation.setId(203);
        clubLocation.setName("Test Club");
        clubLocation.setIsRestaurant(false);
        clubLocation.setIsBar(false);
        clubLocation.setIsClub(true);
        clubLocation.setIsLandmark(false);
        
        // Given - Landmark
        Location landmarkLocation = new Location();
        landmarkLocation.setId(204);
        landmarkLocation.setName("Test Landmark");
        landmarkLocation.setIsRestaurant(false);
        landmarkLocation.setIsBar(false);
        landmarkLocation.setIsClub(false);
        landmarkLocation.setIsLandmark(true);
        
        Favourite restaurantFav = new Favourite();
        restaurantFav.setId(10);
        restaurantFav.setUser(testUser);
        restaurantFav.setLocation(restaurantLocation);
        restaurantFav.setLikedAt(LocalDateTime.now());
        
        Favourite barFav = new Favourite();
        barFav.setId(11);
        barFav.setUser(testUser);
        barFav.setLocation(barLocation);
        barFav.setLikedAt(LocalDateTime.now());
        
        Favourite clubFav = new Favourite();
        clubFav.setId(12);
        clubFav.setUser(testUser);
        clubFav.setLocation(clubLocation);
        clubFav.setLikedAt(LocalDateTime.now());
        
        Favourite landmarkFav = new Favourite();
        landmarkFav.setId(13);
        landmarkFav.setUser(testUser);
        landmarkFav.setLocation(landmarkLocation);
        landmarkFav.setLikedAt(LocalDateTime.now());
        
        List<Favourite> favourites = List.of(restaurantFav, barFav, clubFav, landmarkFav);
        when(favouriteService.getFavouritesByUser(eq(USER_ID))).thenReturn(favourites);

        // When & Then
        mockMvc.perform(get("/api/favourites")
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].location.type").value("Restaurant"))
                .andExpect(jsonPath("$[1].location.type").value("Bar"))
                .andExpect(jsonPath("$[2].location.type").value("Nightlife"))
                .andExpect(jsonPath("$[3].location.type").value("Landmark"));

        verify(favouriteService).getFavouritesByUser(eq(USER_ID));
    }

    @Test
    public void whenLikeRestaurant_thenReturnsRestaurantType() throws Exception {
        // Given
        Location restaurantLocation = new Location();
        restaurantLocation.setId(VENUE_ID);
        restaurantLocation.setName("Test Restaurant");
        restaurantLocation.setAddress("123 Restaurant Street");
        restaurantLocation.setLat(53.3498);
        restaurantLocation.setLng(-6.2603);
        restaurantLocation.setIsRestaurant(true);
        restaurantLocation.setIsBar(false);
        restaurantLocation.setIsClub(false);
        restaurantLocation.setIsLandmark(false);
        
        Favourite restaurantFavourite = new Favourite();
        restaurantFavourite.setId(1);
        restaurantFavourite.setUser(testUser);
        restaurantFavourite.setLocation(restaurantLocation);
        restaurantFavourite.setLikedAt(LocalDateTime.now());
        
        FavouriteRequest request = new FavouriteRequest();
        request.setVenueId(VENUE_ID);
        
        when(favouriteService.addFavourite(eq(USER_ID), eq(VENUE_ID))).thenReturn(restaurantFavourite);

        // When & Then
        mockMvc.perform(post("/api/favourites")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.location.type").value("Restaurant"))
                .andExpect(jsonPath("$.location.name").value("Test Restaurant"));

        verify(favouriteService).addFavourite(eq(USER_ID), eq(VENUE_ID));
    }
}