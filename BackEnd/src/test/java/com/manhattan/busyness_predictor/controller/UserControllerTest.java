package com.manhattan.busyness_predictor.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.security.JwtAuthenticationFilter;
import com.manhattan.busyness_predictor.security.JwtTokenProvider;
import com.manhattan.busyness_predictor.security.UserPrincipal;
import com.manhattan.busyness_predictor.security.CustomUserDetailsService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(UserController.class)
@AutoConfigureMockMvc(addFilters = false)  // disable the filter chain for MockMvc
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @MockBean
    private CustomUserDetailsService customUserDetailsService;

    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void init() {
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void whenGetCurrentUser_thenReturnsUserDto() throws Exception {
        // prepare a fake User + principal
        User u = new User();
        u.setId(42);
        u.setUsername("jane.doe");
        u.setEmail("jane@example.com");
        UserPrincipal principal = new UserPrincipal(u);

        // stash it in the SecurityContext so @AuthenticationPrincipal sees it
        Authentication auth = new UsernamePasswordAuthenticationToken(principal, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        mockMvc.perform(get("/api/users/me"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(42))
            .andExpect(jsonPath("$.username").value("jane.doe"))
            .andExpect(jsonPath("$.email").value("jane@example.com"));
    }

    @Test
    void whenGetCurrentUser_noAuth_thenReturns401() throws Exception {
        // no Authentication in context => controller should refuse
        mockMvc.perform(get("/api/users/me"))
            .andExpect(status().isUnauthorized());
    }
}
