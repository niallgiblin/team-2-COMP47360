package com.manhattan.busyness_predictor.controller;

import com.manhattan.busyness_predictor.dto.CreatePlanRequest;
import com.manhattan.busyness_predictor.dto.PlanResponse;
import com.manhattan.busyness_predictor.dto.SharePlanRequest;
import com.manhattan.busyness_predictor.dto.SharedPlanResponse;
import com.manhattan.busyness_predictor.security.UserPrincipal;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.service.PlanService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(
    controllers = PlanController.class,
    excludeFilters = @ComponentScan.Filter(
        type = FilterType.ASSIGNABLE_TYPE,
        classes = {
            com.manhattan.busyness_predictor.security.JwtAuthenticationFilter.class,
            com.manhattan.busyness_predictor.security.JwtTokenProvider.class
        }
    )
)
@AutoConfigureMockMvc(addFilters = false) // enable security filter chain to populate AuthenticationPrincipal
public class PlanControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private PlanService planService;

    private UserPrincipal testUser;

    @BeforeEach
    void initUser() {
        User user = new User();
        user.setId(42);
        user.setUsername("testuser");
        this.testUser = new UserPrincipal(user);
    }

    @Test
    void whenCreatePlan_thenReturnsCreatedPlan() throws Exception {
        CreatePlanRequest request = new CreatePlanRequest();
        request.setName("Trip");
        request.setLocationIds(Collections.emptyList());

        PlanResponse fakeResponse = new PlanResponse();
        fakeResponse.setId(1);
        fakeResponse.setName("Trip");
        fakeResponse.setCreatedAt(LocalDateTime.of(2025,7,23,12,0));
        fakeResponse.setVenues(Collections.emptyList());

        when(planService.createPlan(
                any(CreatePlanRequest.class),
                eq(testUser.getId())
        )).thenReturn(fakeResponse);

        mockMvc.perform(post("/api/plans")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .with(user(testUser))
        )
        .andExpect(status().isCreated())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.message").value("Plan created successfully"))
        .andExpect(jsonPath("$.plan.id").value(1))
        .andExpect(jsonPath("$.plan.name").value("Trip"));
    }

    @Test
    void whenGetAllPlans_thenReturnsList() throws Exception {
        PlanResponse p = new PlanResponse(1, "Trip", LocalDateTime.of(2025,7,23,12,0), Collections.emptyList());
        List<PlanResponse> list = Collections.singletonList(p);

        when(planService.getAllPlansForUser(eq(testUser.getId())))
            .thenReturn(list);

        mockMvc.perform(get("/api/plans").with(user(testUser)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plans", hasSize(1)))
                .andExpect(jsonPath("$.count").value(1));
    }

    @Test
    void whenGetPlanById_thenReturnsPlan() throws Exception {
        PlanResponse fake = new PlanResponse(2, "Schedule", LocalDateTime.of(2025,7,23,12,5), Collections.emptyList());
        when(planService.getPlanById(eq(2), eq(testUser.getId())))
            .thenReturn(fake);

        mockMvc.perform(get("/api/plans/{id}", 2).with(user(testUser)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plan.id").value(2))
                .andExpect(jsonPath("$.plan.name").value("Schedule"));
    }

    @Test
    void whenDeletePlan_thenReturnsOkMessage() throws Exception {
        doNothing().when(planService).deletePlan(eq(3), eq(testUser.getId()));

        mockMvc.perform(delete("/api/plans/{id}", 3)
                .with(user(testUser))
        )
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.message").value("Plan deleted successfully"));
    }

    @Test
    void whenSharePlan_thenReturnsOkMessage() throws Exception {
        SharePlanRequest req = new SharePlanRequest();
        req.setPlanId(4);
        req.setUserIds(Collections.emptyList());

        doNothing().when(planService)
            .sharePlan(eq(4), eq(testUser.getId()), anyList());

        mockMvc.perform(post("/api/plans/share")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(req))
                .with(user(testUser))
        )
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.message").value("Plan shared successfully"));
    }

    @Test
    void whenGetSharedWithMe_thenReturnsShared() throws Exception {
        List<SharedPlanResponse> sharedList = Collections.emptyList();
        when(planService.getPlansSharedWithUser(eq(testUser.getId())))
            .thenReturn(sharedList);

        mockMvc.perform(get("/api/plans/shared-with-me").with(user(testUser)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sharedPlans", hasSize(0)))
                .andExpect(jsonPath("$.count").value(0));
    }
}
