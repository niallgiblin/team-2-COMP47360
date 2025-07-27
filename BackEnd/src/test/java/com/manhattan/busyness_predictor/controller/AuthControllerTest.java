package com.manhattan.busyness_predictor.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.manhattan.busyness_predictor.dto.AuthResponse;
import com.manhattan.busyness_predictor.dto.LoginRequest;
import com.manhattan.busyness_predictor.dto.SignUpRequest;
import com.manhattan.busyness_predictor.dto.UpdateProfileRequest;
import com.manhattan.busyness_predictor.dto.UserDto;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.security.JwtTokenProvider;
import com.manhattan.busyness_predictor.security.UserPrincipal;
import com.manhattan.busyness_predictor.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;

@WebMvcTest(AuthController.class)
@AutoConfigureMockMvc(addFilters = false)
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AuthService authService;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @MockBean
    private com.manhattan.busyness_predictor.security.CustomUserDetailsService customUserDetailsService;

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void whenSignUp_thenReturnMessageAndTokenAndUser() throws Exception {
        SignUpRequest req = new SignUpRequest();
        req.setUsername("ann");
        req.setEmail("ann@example.com");
        req.setPassword("secret1");       // ≥6 chars
        req.setFirstName("Anna");         // non-empty
        req.setLastName("Smith");         // non-empty

        UserDto userDto = new UserDto();
        userDto.setId(5);
        userDto.setUsername("ann");
        userDto.setEmail("ann@example.com");

        AuthResponse resp = new AuthResponse();
        resp.setUser(userDto);
        resp.setToken("tk-123");

        given(authService.signUp(any(SignUpRequest.class))).willReturn(resp);

        mockMvc.perform(post("/api/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(req)))
            .andExpect(status().isCreated())          // expect 201
            .andExpect(jsonPath("$.message").value("User registered successfully"))
            .andExpect(jsonPath("$.token").value("tk-123"))
            .andExpect(jsonPath("$.user.username").value("ann"));
    }

    @Test
    void whenLogIn_thenReturnTokenAndUser() throws Exception {
        LoginRequest req = new LoginRequest();
        req.setUsernameOrEmail("joe");
        req.setPassword("secret");

        UserDto userDto = new UserDto();
        userDto.setId(2);
        userDto.setUsername("joe");
        userDto.setEmail("joe@example.com");

        AuthResponse resp = new AuthResponse();
        resp.setUser(userDto);
        resp.setToken("abc123");

        given(authService.logIn(any(LoginRequest.class))).willReturn(resp);

        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(req)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").value("abc123"))
            .andExpect(jsonPath("$.user.username").value("joe"));
    }

}
