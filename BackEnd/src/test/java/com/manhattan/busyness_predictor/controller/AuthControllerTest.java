package com.manhattan.busyness_predictor.controller;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Path;
import java.util.List;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.MockitoAnnotations;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.util.ReflectionTestUtils;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.manhattan.busyness_predictor.dto.AuthResponse;
import com.manhattan.busyness_predictor.dto.LoginRequest;
import com.manhattan.busyness_predictor.dto.SignUpRequest;
import com.manhattan.busyness_predictor.dto.UpdateProfileRequest;
import com.manhattan.busyness_predictor.dto.UserDto;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.security.UserPrincipal;
import com.manhattan.busyness_predictor.service.AuthService;

public class AuthControllerTest {
    private static final Integer USER_ID = 1;
    private static final String USERNAME = "testuser";
    private static final String EMAIL = "test@example.com";
    private static final String PASSWORD = "password123";
    private static final String FIRST_NAME = "Test";
    private static final String LAST_NAME = "User";
    private static final String TOKEN = "jwt.token.here";

    @Mock
    private AuthService authService;

    @InjectMocks
    private AuthController authController;

    private MockMvc mockMvc;
    private ObjectMapper objectMapper;
    private User testUser;
    private UserDto testUserDto;
    private UserPrincipal userPrincipal;
    private TestingAuthenticationToken authentication;

    @TempDir
    private Path avatarsDir;

    @BeforeEach
    public void setup() {
        MockitoAnnotations.openMocks(this);
        
        // Setup test user with all required fields
        testUser = new User();
        testUser.setId(USER_ID);
        testUser.setUsername(USERNAME);
        testUser.setEmail(EMAIL);
        testUser.setFirstName(FIRST_NAME);
        testUser.setLastName(LAST_NAME);
        testUser.setPassword(PASSWORD);
        
        testUserDto = UserDto.fromUser(testUser);
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
                .standaloneSetup(authController)
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
        ReflectionTestUtils.setField(authController, "avatarsDir", avatarsDir.toString());
    }

    // Test-specific global exception handler
    @org.springframework.web.bind.annotation.ControllerAdvice
    public static class TestGlobalExceptionHandler {
        @org.springframework.web.bind.annotation.ExceptionHandler(org.springframework.web.bind.MethodArgumentNotValidException.class)
        public org.springframework.http.ResponseEntity<?> handleValidationExceptions(
                org.springframework.web.bind.MethodArgumentNotValidException ex) {
            return new org.springframework.http.ResponseEntity<>("Validation failed", org.springframework.http.HttpStatus.BAD_REQUEST);
        }
        
        @org.springframework.web.bind.annotation.ExceptionHandler(RuntimeException.class)
        public org.springframework.http.ResponseEntity<?> handleRuntimeException(RuntimeException ex) {
            java.util.Map<String, String> errorDetails = new java.util.HashMap<>();
            errorDetails.put("error", "An unexpected internal server error has occurred.");
            errorDetails.put("message", ex.getMessage());
            return new org.springframework.http.ResponseEntity<>(errorDetails, org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR);
        }

        @org.springframework.web.bind.annotation.ExceptionHandler(IllegalArgumentException.class)
        public org.springframework.http.ResponseEntity<?> handleIllegalArgumentException(IllegalArgumentException ex) {
            java.util.Map<String, Object> errorDetails = new java.util.HashMap<>();
            errorDetails.put("error", "Bad request");
            errorDetails.put("message", ex.getMessage());
            errorDetails.put("status", 400);
            errorDetails.put("code", "BAD_REQUEST");
            return new org.springframework.http.ResponseEntity<>(errorDetails, org.springframework.http.HttpStatus.BAD_REQUEST);
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
    public void whenSignUp_thenReturnsSuccessWithUserAndToken() throws Exception {
        // Given
        SignUpRequest request = new SignUpRequest(USERNAME, EMAIL, PASSWORD, FIRST_NAME, LAST_NAME);
        AuthResponse authResponse = new AuthResponse(testUserDto, TOKEN);
        
        when(authService.signUp(any(SignUpRequest.class))).thenReturn(authResponse);

        // When & Then
        mockMvc.perform(post("/api/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.message").value("User registered successfully"))
                .andExpect(jsonPath("$.user.username").value(USERNAME))
                .andExpect(jsonPath("$.user.email").value(EMAIL))
                .andExpect(jsonPath("$.token").value(TOKEN));

        verify(authService).signUp(any(SignUpRequest.class));
    }

    @Test
    public void whenSignUpWithInvalidData_thenReturnsBadRequest() throws Exception {
        // Given - invalid data
        SignUpRequest request = new SignUpRequest();
        request.setUsername("ab");
        request.setEmail("invalid-email");
        request.setPassword("123");
        request.setFirstName("");
        request.setLastName("");

        // When & Then
        mockMvc.perform(post("/api/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());

        verify(authService, never()).signUp(any(SignUpRequest.class));
    }

    @Test
    public void whenSignUpWithExistingUsername_thenReturnsInternalServerError() throws Exception {
        // Given
        SignUpRequest request = new SignUpRequest(USERNAME, EMAIL, PASSWORD, FIRST_NAME, LAST_NAME);
        
        when(authService.signUp(any(SignUpRequest.class)))
                .thenThrow(new RuntimeException("Username is already taken"));

        // When & Then
        mockMvc.perform(post("/api/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("Username is already taken"));

        verify(authService).signUp(any(SignUpRequest.class));
    }

    @Test
    public void whenLogin_thenReturnsSuccessWithUserAndToken() throws Exception {
        // Given
        LoginRequest request = new LoginRequest(USERNAME, PASSWORD);
        AuthResponse authResponse = new AuthResponse(testUserDto, TOKEN);
        
        when(authService.logIn(any(LoginRequest.class))).thenReturn(authResponse);

        // When & Then
        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Login successful"))
                .andExpect(jsonPath("$.user.username").value(USERNAME))
                .andExpect(jsonPath("$.token").value(TOKEN));

        verify(authService).logIn(any(LoginRequest.class));
    }

    @Test
    public void whenLoginWithInvalidCredentials_thenReturnsInternalServerError() throws Exception {
        // Given
        LoginRequest request = new LoginRequest("wronguser", "wrongpass");
        
        when(authService.logIn(any(LoginRequest.class)))
                .thenThrow(new RuntimeException("Invalid credentials"));

        // When & Then
        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("Invalid credentials"));

        verify(authService).logIn(any(LoginRequest.class));
    }

    @Test
    public void whenGetMe_thenReturnsCurrentUser() throws Exception {
        // When & Then - use authentication header to trigger our custom filter
        mockMvc.perform(get("/api/auth/me")
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(USERNAME))
                .andExpect(jsonPath("$.email").value(EMAIL))
                .andExpect(jsonPath("$.firstName").value(FIRST_NAME));
    }

    @Test
    public void whenGetMeWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        // When & Then - no authentication provided (no .with() and no Authorization header)
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    public void whenUpdateProfile_thenReturnsUpdatedUser() throws Exception {
        // Given
        UpdateProfileRequest request = new UpdateProfileRequest();
        request.setFirstName("UpdatedFirst");
        request.setLastName("UpdatedLast");
        
        UserDto updatedUserDto = new UserDto();
        updatedUserDto.setId(USER_ID);
        updatedUserDto.setUsername(USERNAME);
        updatedUserDto.setFirstName("UpdatedFirst");
        updatedUserDto.setLastName("UpdatedLast");
        
        when(authService.updateProfile(eq(USER_ID), any(UpdateProfileRequest.class)))
                .thenReturn(updatedUserDto);

        // When & Then
        mockMvc.perform(put("/api/auth/profile/{userId}", USER_ID)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Profile updated successfully"))
                .andExpect(jsonPath("$.user.firstName").value("UpdatedFirst"))
                .andExpect(jsonPath("$.user.lastName").value("UpdatedLast"));

        verify(authService).updateProfile(eq(USER_ID), any(UpdateProfileRequest.class));
    }

    @Test
    public void whenUpdateProfileWithWrongUserId_thenReturnsInternalServerError() throws Exception {
        // Given
        Integer wrongUserId = 999;
        UpdateProfileRequest request = new UpdateProfileRequest();
        request.setFirstName("UpdatedFirst");
        request.setLastName("UpdatedLast");

        // When & Then
        mockMvc.perform(put("/api/auth/profile/{userId}", wrongUserId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("You are not authorized to update this profile. You can only update your own."));

        verify(authService, never()).updateProfile(any(), any());
    }

    @Test
    public void whenUpdateProfileWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        // Given
        UpdateProfileRequest request = new UpdateProfileRequest();
        request.setFirstName("NewName");

        // When & Then - no authentication provided (no .with() and no Authorization header)
        mockMvc.perform(put("/api/auth/profile/{userId}", USER_ID)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());

        verify(authService, never()).updateProfile(any(), any());
    }

    @Test
    public void whenLoginWithMissingFields_thenReturnsBadRequest() throws Exception {
        // Given
        LoginRequest request = new LoginRequest();
        request.setUsernameOrEmail("");
        request.setPassword("");

        // When & Then
        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());

        verify(authService, never()).logIn(any(LoginRequest.class));
    }

    @Test
    public void whenUpdateProfileWithValidPasswordChange_thenReturnsSuccess() throws Exception {
        // Given
        UpdateProfileRequest request = new UpdateProfileRequest();
        request.setCurrentPassword("oldpassword");
        request.setNewPassword("newpassword123");
        
        when(authService.updateProfile(eq(USER_ID), any(UpdateProfileRequest.class)))
                .thenReturn(testUserDto);

        // When & Then
        mockMvc.perform(put("/api/auth/profile/{userId}", USER_ID)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Profile updated successfully"));

        verify(authService).updateProfile(eq(USER_ID), any(UpdateProfileRequest.class));
    }

    @Test
    public void whenUpdateProfileWithInvalidData_thenReturnsBadRequest() throws Exception {
        // Given
        UpdateProfileRequest request = new UpdateProfileRequest();
        request.setFirstName("A");
        request.setLastName("B");
        request.setEmail("invalid-email");
        request.setUsername("ab");
        request.setPhoneNumber("123");
        request.setNewPassword("123");

        // When & Then
        mockMvc.perform(put("/api/auth/profile/{userId}", USER_ID)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isBadRequest());

        verify(authService, never()).updateProfile(any(), any());
    }

    @Test
    public void whenUpdateProfileWithValidData_thenReturnsSuccess() throws Exception {
        // Given
        UpdateProfileRequest request = new UpdateProfileRequest();
        request.setFirstName("UpdatedFirst");
        request.setLastName("UpdatedLast");
        request.setEmail("updated@example.com");
        request.setUsername("updateduser");
        request.setPhoneNumber("1234567890");
        
        UserDto updatedUserDto = new UserDto();
        updatedUserDto.setId(USER_ID);
        updatedUserDto.setUsername("updateduser");
        updatedUserDto.setFirstName("UpdatedFirst");
        updatedUserDto.setLastName("UpdatedLast");
        updatedUserDto.setEmail("updated@example.com");
        updatedUserDto.setPhoneNumber("1234567890");
        
        when(authService.updateProfile(eq(USER_ID), any(UpdateProfileRequest.class)))
                .thenReturn(updatedUserDto);

        // When & Then
        mockMvc.perform(put("/api/auth/profile/{userId}", USER_ID)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Profile updated successfully"))
                .andExpect(jsonPath("$.user.firstName").value("UpdatedFirst"))
                .andExpect(jsonPath("$.user.lastName").value("UpdatedLast"))
                .andExpect(jsonPath("$.user.email").value("updated@example.com"))
                .andExpect(jsonPath("$.user.username").value("updateduser"))
                .andExpect(jsonPath("$.user.phoneNumber").value("1234567890"));

        verify(authService).updateProfile(eq(USER_ID), any(UpdateProfileRequest.class));
    }

    @Test
    public void whenAvatarUploadHasSpoofedContentType_thenReturnsBadRequest() throws Exception {
        MockMultipartFile spoofed = new MockMultipartFile(
                "avatar", "profile.jpg", "image/jpeg", "not-an-image".getBytes());

        mockMvc.perform(multipart("/api/auth/profile/{userId}/avatar", USER_ID)
                .file(spoofed)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isBadRequest());

        verify(authService, never()).updateUserAvatar(any(), anyString());
    }

    @Test
    public void whenAvatarUploadHasMismatchedExtension_thenReturnsBadRequest() throws Exception {
        MockMultipartFile mismatched = new MockMultipartFile(
                "avatar", "profile.gif", "image/png", imageBytes("png"));

        mockMvc.perform(multipart("/api/auth/profile/{userId}/avatar", USER_ID)
                .file(mismatched)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isBadRequest());

        verify(authService, never()).updateUserAvatar(any(), anyString());
    }

    @Test
    public void whenValidJpegAvatarUploaded_thenUsesGeneratedNameWithoutOriginalBasename() throws Exception {
        UserDto updated = new UserDto();
        updated.setId(USER_ID);
        updated.setUsername(USERNAME);
        updated.setAvatarUrl("/avatars/avatar_user_1_123.jpg");
        when(authService.updateUserAvatar(eq(USER_ID), anyString())).thenReturn(updated);

        MockMultipartFile jpeg = new MockMultipartFile(
                "avatar", "my-face.jpg", "application/octet-stream", imageBytes("jpg"));

        mockMvc.perform(multipart("/api/auth/profile/{userId}/avatar", USER_ID)
                .file(jpeg)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk());

        org.mockito.ArgumentCaptor<String> avatarUrl = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(authService).updateUserAvatar(eq(USER_ID), avatarUrl.capture());
        org.assertj.core.api.Assertions.assertThat(avatarUrl.getValue()).startsWith("/avatars/avatar_user_1_");
        org.assertj.core.api.Assertions.assertThat(avatarUrl.getValue()).endsWith(".jpg");
        org.assertj.core.api.Assertions.assertThat(avatarUrl.getValue()).doesNotContain("my-face");
    }

    @Test
    public void whenValidPngAvatarUploaded_thenUsesPngGeneratedName() throws Exception {
        UserDto updated = new UserDto();
        updated.setId(USER_ID);
        updated.setUsername(USERNAME);
        updated.setAvatarUrl("/avatars/avatar_user_1_123.png");
        when(authService.updateUserAvatar(eq(USER_ID), anyString())).thenReturn(updated);

        MockMultipartFile png = new MockMultipartFile(
                "avatar", "original.png", "image/jpeg", imageBytes("png"));

        mockMvc.perform(multipart("/api/auth/profile/{userId}/avatar", USER_ID)
                .file(png)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk());

        org.mockito.ArgumentCaptor<String> avatarUrl = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(authService).updateUserAvatar(eq(USER_ID), avatarUrl.capture());
        org.assertj.core.api.Assertions.assertThat(avatarUrl.getValue()).startsWith("/avatars/avatar_user_1_");
        org.assertj.core.api.Assertions.assertThat(avatarUrl.getValue()).endsWith(".png");
        org.assertj.core.api.Assertions.assertThat(avatarUrl.getValue()).doesNotContain("original");
    }

    private byte[] imageBytes(String format) throws Exception {
        BufferedImage image = new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(image, format, output);
        return output.toByteArray();
    }
}
