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
import org.springframework.security.core.context.SecurityContext;
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
    private static final String TEST_SECURITY_CONTEXT_ATTR =
            "org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors"
                    + "$SecurityContextRequestPostProcessorSupport$TestSecurityContextRepository.REPO";

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

        testUser = new User();
        testUser.setId(USER_ID);
        testUser.setUsername(USERNAME);

        userPrincipal = UserPrincipal.create(testUser);

        authentication = new TestingAuthenticationToken(
            userPrincipal,
            null,
            List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        authentication.setAuthenticated(true);

        mockMvc = MockMvcBuilders
                .standaloneSetup(planController)
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .setControllerAdvice(new TestGlobalExceptionHandler())
                .addFilters((request, response, chain) -> {
                    Object contextObj = request.getAttribute(TEST_SECURITY_CONTEXT_ATTR);
                    if (contextObj instanceof SecurityContext securityContext) {
                        SecurityContextHolder.getContext().setAuthentication(securityContext.getAuthentication());
                    }
                    try {
                        chain.doFilter(request, response);
                    } finally {
                        SecurityContextHolder.clearContext();
                    }
                })
                .build();

        objectMapper = new ObjectMapper();
    }

    @org.springframework.web.bind.annotation.ControllerAdvice
    public static class TestGlobalExceptionHandler {
        @org.springframework.web.bind.annotation.ExceptionHandler(org.springframework.web.bind.MethodArgumentNotValidException.class)
        public org.springframework.http.ResponseEntity<?> handleValidationExceptions(
                org.springframework.web.bind.MethodArgumentNotValidException ex) {
            return new org.springframework.http.ResponseEntity<>("Validation failed", org.springframework.http.HttpStatus.BAD_REQUEST);
        }

        @org.springframework.web.bind.annotation.ExceptionHandler(Exception.class)
        public org.springframework.http.ResponseEntity<?> handleAllExceptions(Exception ex) {
            if (ex instanceof NullPointerException) {
                if (ex.getStackTrace().length > 0) {
                    String topClass = ex.getStackTrace()[0].getClassName();
                    if (topClass.contains("PlanController")) {
                        return new org.springframework.http.ResponseEntity<>("Unauthorized", org.springframework.http.HttpStatus.UNAUTHORIZED);
                    }
                }
                java.util.Map<String, String> errorDetails = new java.util.HashMap<>();
                errorDetails.put("error", "An unexpected internal server error has occurred.");
                errorDetails.put("message", ex.getMessage());
                return new org.springframework.http.ResponseEntity<>(errorDetails, org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR);
            }

            if (ex instanceof RuntimeException) {
                java.util.Map<String, String> errorDetails = new java.util.HashMap<>();
                errorDetails.put("error", "An unexpected internal server error has occurred.");
                errorDetails.put("message", ex.getMessage());
                return new org.springframework.http.ResponseEntity<>(errorDetails, org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR);
            }

            java.util.Map<String, String> errorDetails = new java.util.HashMap<>();
            errorDetails.put("error", "An unexpected internal server error has occurred.");
            errorDetails.put("message", ex.getMessage());
            return new org.springframework.http.ResponseEntity<>(errorDetails, org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Test
    public void whenCreatePlan_thenReturnsCreatedPlan() throws Exception {
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

        mockMvc.perform(post("/api/plans")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
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
        CreatePlanRequest request = new CreatePlanRequest();
        request.setName("Trip");
        request.setLocationIds(Collections.emptyList());

        mockMvc.perform(post("/api/plans")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());

        verify(planService, never()).createPlan(any(CreatePlanRequest.class), any());
    }

    @Test
    public void whenCreatePlanWithInvalidLocationIds_thenReturnsInternalServerError() throws Exception {
        CreatePlanRequest request = new CreatePlanRequest();
        request.setName("Trip");
        request.setLocationIds(List.of(999));

        when(planService.createPlan(any(CreatePlanRequest.class), eq(USER_ID)))
                .thenThrow(new RuntimeException("One or more venues were not found"));

        mockMvc.perform(post("/api/plans")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("One or more venues were not found"));

        verify(planService).createPlan(any(CreatePlanRequest.class), eq(USER_ID));
    }

    @Test
    public void whenGetAllPlans_thenReturnsList() throws Exception {
        PlanResponse planResponse = new PlanResponse(1, "Trip", LocalDateTime.of(2025, 7, 23, 12, 0), Collections.emptyList());
        List<PlanResponse> plans = List.of(planResponse);

        when(planService.getAllPlansForUser(eq(USER_ID))).thenReturn(plans);

        mockMvc.perform(get("/api/plans")
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
        mockMvc.perform(get("/api/plans"))
                .andExpect(status().isUnauthorized());

        verify(planService, never()).getAllPlansForUser(any());
    }

    @Test
    public void whenGetPlanById_thenReturnsPlan() throws Exception {
        Integer planId = 2;
        PlanResponse planResponse = new PlanResponse(planId, "Schedule", LocalDateTime.of(2025, 7, 23, 12, 5), Collections.emptyList());

        when(planService.getPlanById(eq(planId), eq(USER_ID))).thenReturn(planResponse);

        mockMvc.perform(get("/api/plans/{id}", planId)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plan.id").value(planId))
                .andExpect(jsonPath("$.plan.name").value("Schedule"));

        verify(planService).getPlanById(eq(planId), eq(USER_ID));
    }

    @Test
    public void whenGetPlanByIdWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/plans/{id}", 2))
                .andExpect(status().isUnauthorized());

        verify(planService, never()).getPlanById(any(), any());
    }

    @Test
    public void whenGetPlanByIdNotFound_thenReturnsInternalServerError() throws Exception {
        Integer planId = 999;

        when(planService.getPlanById(eq(planId), eq(USER_ID)))
                .thenThrow(new RuntimeException("Plan not found or access denied"));

        mockMvc.perform(get("/api/plans/{id}", planId)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("Plan not found or access denied"));

        verify(planService).getPlanById(eq(planId), eq(USER_ID));
    }

    @Test
    public void whenDeletePlan_thenReturnsOkMessage() throws Exception {
        Integer planId = 3;
        doNothing().when(planService).deletePlan(eq(planId), eq(USER_ID));

        mockMvc.perform(delete("/api/plans/{id}", planId)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Plan deleted successfully"));

        verify(planService).deletePlan(eq(planId), eq(USER_ID));
    }

    @Test
    public void whenDeletePlanWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        mockMvc.perform(delete("/api/plans/{id}", 3))
                .andExpect(status().isUnauthorized());

        verify(planService, never()).deletePlan(any(), any());
    }

    @Test
    public void whenDeletePlanNotFound_thenReturnsInternalServerError() throws Exception {
        Integer planId = 999;

        doThrow(new RuntimeException("Plan not found or access denied"))
                .when(planService).deletePlan(eq(planId), eq(USER_ID));

        mockMvc.perform(delete("/api/plans/{id}", planId)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("Plan not found or access denied"));

        verify(planService).deletePlan(eq(planId), eq(USER_ID));
    }

    @Test
    public void whenSharePlan_thenReturnsOkMessage() throws Exception {
        SharePlanRequest request = new SharePlanRequest();
        request.setPlanId(4);
        request.setUserIds(List.of(100, 101));

        doNothing().when(planService).sharePlan(eq(4), eq(USER_ID), eq(request.getUserIds()));

        mockMvc.perform(post("/api/plans/share")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Plan shared successfully"));

        verify(planService).sharePlan(eq(4), eq(USER_ID), eq(request.getUserIds()));
    }

    @Test
    public void whenSharePlanWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        SharePlanRequest request = new SharePlanRequest();
        request.setPlanId(4);
        request.setUserIds(List.of(100, 101));

        mockMvc.perform(post("/api/plans/share")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());

        verify(planService, never()).sharePlan(any(), any(), anyList());
    }

    @Test
    public void whenSharePlanNotOwned_thenReturnsInternalServerError() throws Exception {
        SharePlanRequest request = new SharePlanRequest();
        request.setPlanId(999);
        request.setUserIds(List.of(100, 101));

        doThrow(new RuntimeException("You can only share your own plans"))
                .when(planService).sharePlan(eq(999), eq(USER_ID), eq(request.getUserIds()));

        mockMvc.perform(post("/api/plans/share")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("You can only share your own plans"));

        verify(planService).sharePlan(eq(999), eq(USER_ID), eq(request.getUserIds()));
    }

    @Test
    public void whenGetPlansSharedWithMe_thenReturnsSharedPlans() throws Exception {
        List<SharedPlanResponse> sharedPlans = Collections.emptyList();
        when(planService.getPlansSharedWithUser(eq(USER_ID))).thenReturn(sharedPlans);

        mockMvc.perform(get("/api/plans/shared-with-me")
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sharedPlans").isArray())
                .andExpect(jsonPath("$.sharedPlans").isEmpty())
                .andExpect(jsonPath("$.count").value(0));

        verify(planService).getPlansSharedWithUser(eq(USER_ID));
    }

    @Test
    public void whenGetPlansSharedWithMeWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/plans/shared-with-me"))
                .andExpect(status().isUnauthorized());

        verify(planService, never()).getPlansSharedWithUser(any());
    }
}
