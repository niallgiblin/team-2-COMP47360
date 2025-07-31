package com.manhattan.busyness_predictor.controller;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.manhattan.busyness_predictor.dto.CreatePlanRequest;
import com.manhattan.busyness_predictor.dto.PlanResponse;
import com.manhattan.busyness_predictor.dto.SharePlanRequest;
import com.manhattan.busyness_predictor.dto.SharedPlanResponse;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.security.UserPrincipal;
import com.manhattan.busyness_predictor.service.PlanService;

public class PlanControllerTest {
    private static final Integer USER_ID = 42;
    private static final String USERNAME = "testuser";
    private static final String TOKEN = "jwt.token.here";

    @Mock
    private PlanService planService;

    @InjectMocks
    private PlanController planController;

    private MockMvc mockMvc;
    private ObjectMapper objectMapper;
    private User testUser;
    private UserPrincipal userPrincipal;
    private TestingAuthenticationToken authentication;

    @BeforeEach
    public void setup() {
        MockitoAnnotations.openMocks(this);
        
        // Setup test user with all required fields
        testUser = new User();
        testUser.setId(USER_ID);
        testUser.setUsername(USERNAME);
        
        userPrincipal = UserPrincipal.create(testUser);
        
        // Create authentication object
        authentication = new TestingAuthenticationToken(
            userPrincipal, 
            null, 
            List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        authentication.setAuthenticated(true);
        
        // Setup MockMvc with proper security configuration
        mockMvc = MockMvcBuilders
                .standaloneSetup(planController)
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
        
        @org.springframework.web.bind.annotation.ExceptionHandler(IllegalStateException.class)
        public org.springframework.http.ResponseEntity<?> handleIllegalStateException(IllegalStateException ex) {
            // Check if this is an authentication-related exception
            if (ex.getMessage() != null && ex.getMessage().contains("Unable to retrieve current user")) {
                return new org.springframework.http.ResponseEntity<>("Unauthorized", org.springframework.http.HttpStatus.UNAUTHORIZED);
            }
            // Otherwise treat as a general server error
            java.util.Map<String, String> errorDetails = new java.util.HashMap<>();
            errorDetails.put("error", "An unexpected internal server error has occurred.");
            errorDetails.put("message", ex.getMessage());
            return new org.springframework.http.ResponseEntity<>(errorDetails, org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR);
        }
        
        @org.springframework.web.bind.annotation.ExceptionHandler(RuntimeException.class)
        public org.springframework.http.ResponseEntity<?> handleRuntimeException(RuntimeException ex) {
            java.util.Map<String, String> errorDetails = new java.util.HashMap<>();
            errorDetails.put("error", "An unexpected internal server error has occurred.");
            errorDetails.put("message", ex.getMessage());
            return new org.springframework.http.ResponseEntity<>(errorDetails, org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR);
        }
        
        @org.springframework.web.bind.annotation.ExceptionHandler(Exception.class)
        public org.springframework.http.ResponseEntity<?> handleGlobalException(Exception ex) {
            java.util.Map<String, String> errorDetails = new java.util.HashMap<>();
            errorDetails.put("error", "An unexpected internal server error has occurred.");
            errorDetails.put("message", ex.getMessage());
            return new org.springframework.http.ResponseEntity<>(errorDetails, org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Test
    public void whenCreatePlan_thenReturnsCreatedPlan() throws Exception {
        // Given
        CreatePlanRequest request = new CreatePlanRequest();
        request.setName("Trip");
        request.setLocationIds(Collections.emptyList());

        PlanResponse fakeResponse = new PlanResponse();
        fakeResponse.setId(1);
        fakeResponse.setName("Trip");
        fakeResponse.setCreatedAt(LocalDateTime.of(2025, 7, 23, 12, 0));
        fakeResponse.setVenues(Collections.emptyList());

        when(planService.createPlan(any(CreatePlanRequest.class), eq(USER_ID)))
                .thenReturn(fakeResponse);

        // When & Then
        mockMvc.perform(post("/api/plans")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isCreated())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.message").value("Plan created successfully"))
                .andExpect(jsonPath("$.plan.id").value(1))
                .andExpect(jsonPath("$.plan.name").value("Trip"));

        verify(planService).createPlan(any(CreatePlanRequest.class), eq(USER_ID));
    }

    @Test
    public void whenCreatePlanWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        // Given
        CreatePlanRequest request = new CreatePlanRequest();
        request.setName("Trip");
        request.setLocationIds(Collections.emptyList());

        // When & Then - no authentication provided
        mockMvc.perform(post("/api/plans")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());

        verify(planService, never()).createPlan(any(CreatePlanRequest.class), any());
    }

    @Test
    public void whenCreatePlanWithInvalidLocationIds_thenReturnsInternalServerError() throws Exception {
        // Given
        CreatePlanRequest request = new CreatePlanRequest();
        request.setName("Trip");
        request.setLocationIds(List.of(999)); // Non-existent location ID

        when(planService.createPlan(any(CreatePlanRequest.class), eq(USER_ID)))
                .thenThrow(new RuntimeException("One or more venues were not found"));

        // When & Then
        mockMvc.perform(post("/api/plans")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("One or more venues were not found"));

        verify(planService).createPlan(any(CreatePlanRequest.class), eq(USER_ID));
    }

    @Test
    public void whenGetAllPlans_thenReturnsList() throws Exception {
        // Given
        PlanResponse planResponse = new PlanResponse(1, "Trip", LocalDateTime.of(2025, 7, 23, 12, 0), Collections.emptyList());
        List<PlanResponse> plans = List.of(planResponse);

        when(planService.getAllPlansForUser(eq(USER_ID))).thenReturn(plans);

        // When & Then
        mockMvc.perform(get("/api/plans")
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plans").isArray())
                .andExpect(jsonPath("$.plans[0].id").value(1))
                .andExpect(jsonPath("$.plans[0].name").value("Trip"))
                .andExpect(jsonPath("$.count").value(1));

        verify(planService).getAllPlansForUser(eq(USER_ID));
    }

    @Test
    public void whenGetAllPlansWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        // When & Then - no authentication provided
        mockMvc.perform(get("/api/plans"))
                .andExpect(status().isUnauthorized());

        verify(planService, never()).getAllPlansForUser(any());
    }

    @Test
    public void whenGetPlanById_thenReturnsPlan() throws Exception {
        // Given
        Integer planId = 2;
        PlanResponse planResponse = new PlanResponse(planId, "Schedule", LocalDateTime.of(2025, 7, 23, 12, 5), Collections.emptyList());

        when(planService.getPlanById(eq(planId), eq(USER_ID))).thenReturn(planResponse);

        // When & Then
        mockMvc.perform(get("/api/plans/{id}", planId)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plan.id").value(planId))
                .andExpect(jsonPath("$.plan.name").value("Schedule"));

        verify(planService).getPlanById(eq(planId), eq(USER_ID));
    }

    @Test
    public void whenGetPlanByIdWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        // When & Then - no authentication provided
        mockMvc.perform(get("/api/plans/{id}", 2))
                .andExpect(status().isUnauthorized());

        verify(planService, never()).getPlanById(any(), any());
    }

    @Test
    public void whenGetPlanByIdNotFound_thenReturnsInternalServerError() throws Exception {
        // Given
        Integer planId = 999;

        when(planService.getPlanById(eq(planId), eq(USER_ID)))
                .thenThrow(new RuntimeException("Plan not found or access denied"));

        // When & Then
        mockMvc.perform(get("/api/plans/{id}", planId)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("Plan not found or access denied"));

        verify(planService).getPlanById(eq(planId), eq(USER_ID));
    }

    @Test
    public void whenDeletePlan_thenReturnsOkMessage() throws Exception {
        // Given
        Integer planId = 3;
        doNothing().when(planService).deletePlan(eq(planId), eq(USER_ID));

        // When & Then
        mockMvc.perform(delete("/api/plans/{id}", planId)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Plan deleted successfully"));

        verify(planService).deletePlan(eq(planId), eq(USER_ID));
    }

    @Test
    public void whenDeletePlanWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        // When & Then - no authentication provided
        mockMvc.perform(delete("/api/plans/{id}", 3))
                .andExpect(status().isUnauthorized());

        verify(planService, never()).deletePlan(any(), any());
    }

    @Test
    public void whenDeletePlanNotFound_thenReturnsInternalServerError() throws Exception {
        // Given
        Integer planId = 999;
        
        doThrow(new RuntimeException("Plan not found or access denied"))
                .when(planService).deletePlan(eq(planId), eq(USER_ID));

        // When & Then
        mockMvc.perform(delete("/api/plans/{id}", planId)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("Plan not found or access denied"));

        verify(planService).deletePlan(eq(planId), eq(USER_ID));
    }

    @Test
    public void whenSharePlan_thenReturnsOkMessage() throws Exception {
        // Given
        SharePlanRequest request = new SharePlanRequest();
        request.setPlanId(4);
        request.setUserIds(List.of(100, 101));

        doNothing().when(planService).sharePlan(eq(4), eq(USER_ID), eq(request.getUserIds()));

        // When & Then
        mockMvc.perform(post("/api/plans/share")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Plan shared successfully"));

        verify(planService).sharePlan(eq(4), eq(USER_ID), eq(request.getUserIds()));
    }

    @Test
    public void whenSharePlanWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        // Given
        SharePlanRequest request = new SharePlanRequest();
        request.setPlanId(4);
        request.setUserIds(List.of(100, 101));

        // When & Then - no authentication provided
        mockMvc.perform(post("/api/plans/share")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());

        verify(planService, never()).sharePlan(any(), any(), anyList());
    }

    @Test
    public void whenSharePlanNotOwned_thenReturnsInternalServerError() throws Exception {
        // Given
        SharePlanRequest request = new SharePlanRequest();
        request.setPlanId(999);
        request.setUserIds(List.of(100, 101));

        doThrow(new RuntimeException("You can only share your own plans"))
                .when(planService).sharePlan(eq(999), eq(USER_ID), eq(request.getUserIds()));

        // When & Then
        mockMvc.perform(post("/api/plans/share")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("You can only share your own plans"));

        verify(planService).sharePlan(eq(999), eq(USER_ID), eq(request.getUserIds()));
    }

    @Test
    public void whenGetPlansSharedWithMe_thenReturnsSharedPlans() throws Exception {
        // Given
        List<SharedPlanResponse> sharedPlans = Collections.emptyList();
        when(planService.getPlansSharedWithUser(eq(USER_ID))).thenReturn(sharedPlans);

        // When & Then
        mockMvc.perform(get("/api/plans/shared-with-me")
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sharedPlans").isArray())
                .andExpect(jsonPath("$.sharedPlans").isEmpty())
                .andExpect(jsonPath("$.count").value(0));

        verify(planService).getPlansSharedWithUser(eq(USER_ID));
    }

    @Test
    public void whenGetPlansSharedWithMeWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        // When & Then - no authentication provided
        mockMvc.perform(get("/api/plans/shared-with-me"))
                .andExpect(status().isUnauthorized());

        verify(planService, never()).getPlansSharedWithUser(any());
    }
}
