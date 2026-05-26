package com.manhattan.busyness_predictor.config;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.manhattan.busyness_predictor.controller.AuthController;
import com.manhattan.busyness_predictor.controller.AvatarController;
import com.manhattan.busyness_predictor.controller.VibeController;
import com.manhattan.busyness_predictor.dto.AuthResponse;
import com.manhattan.busyness_predictor.dto.UserDto;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.security.CustomUserDetailsService;
import com.manhattan.busyness_predictor.security.JwtAuthenticationFilter;
import com.manhattan.busyness_predictor.security.JwtTokenProvider;
import com.manhattan.busyness_predictor.security.RateLimitFilter;
import com.manhattan.busyness_predictor.security.RateLimitService;
import com.manhattan.busyness_predictor.security.RateLimitService.RateLimitResult;
import com.manhattan.busyness_predictor.security.UserPrincipal;
import com.manhattan.busyness_predictor.service.AuthService;
import com.manhattan.busyness_predictor.service.VibeService;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = {VibeController.class, AuthController.class, AvatarController.class})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, RateLimitFilter.class})
class SecurityBoundaryTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private VibeService vibeService;

    @MockBean
    private AuthService authService;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @MockBean
    private CustomUserDetailsService customUserDetailsService;

    @MockBean
    private RateLimitService rateLimitService;

    @BeforeEach
    void setUp() {
        when(rateLimitService.consume(anyString())).thenReturn(RateLimitResult.allowed(10));
    }

    @Test
    void expensiveVibeRoutesRequireAuthentication() throws Exception {
        mockMvc.perform(post("/api/vibe/search")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"vibeDescription\":\"jazz\",\"maxResults\":5}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Authentication required"));

        mockMvc.perform(post("/api/vibe/similar").param("locationId", "1").param("limit", "5"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Authentication required"));

        mockMvc.perform(get("/api/vibe/map-data"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Authentication required"));

        mockMvc.perform(get("/api/vibe/trending"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Authentication required"));
    }

    @Test
    void publicBoundaryRemainsAccessibleWithoutAuthentication() throws Exception {
        UserDto user = new UserDto();
        user.setId(1);
        user.setUsername("testuser");
        AuthResponse response = new AuthResponse(user, "token");
        when(authService.logIn(org.mockito.ArgumentMatchers.any())).thenReturn(response);
        when(authService.signUp(org.mockito.ArgumentMatchers.any())).thenReturn(response);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"usernameOrEmail\":\"testuser\",\"password\":\"password123\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"testuser\",\"email\":\"test@example.com\",\"password\":\"password123\",\"firstName\":\"Test\",\"lastName\":\"User\"}"))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/avatars/test.jpg"))
                .andExpect(status().isNotFound());
    }

    @Test
    void malformedJwtUsesStableAuthenticationResponse() throws Exception {
        when(jwtTokenProvider.validateToken("bad.token")).thenReturn(false);

        mockMvc.perform(get("/api/vibe/trending")
                        .header("Authorization", "Bearer bad.token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Authentication required"))
                .andExpect(jsonPath("$.message").value("Authentication required"))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    }

    @Test
    void rateLimitDenialReturnsStable429WithRetryAfter() throws Exception {
        User user = new User();
        user.setId(7);
        user.setUsername("rate-limited");
        user.setPassword("password");
        when(jwtTokenProvider.validateToken("good.token")).thenReturn(true);
        when(jwtTokenProvider.getUserIdFromJWT("good.token")).thenReturn(7);
        when(customUserDetailsService.loadUserById(7)).thenReturn(UserPrincipal.create(user));
        when(rateLimitService.consume(anyString())).thenReturn(RateLimitResult.denied(42));

        mockMvc.perform(get("/api/vibe/trending")
                        .header("Authorization", "Bearer good.token"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "42"))
                .andExpect(jsonPath("$.error").value("Too many requests"))
                .andExpect(jsonPath("$.message").value("Too many requests"))
                .andExpect(jsonPath("$.status").value(429))
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
    }
}
