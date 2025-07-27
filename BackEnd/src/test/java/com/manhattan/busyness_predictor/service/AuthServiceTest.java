package com.manhattan.busyness_predictor.service;

import com.manhattan.busyness_predictor.dto.AuthResponse;
import com.manhattan.busyness_predictor.dto.LoginRequest;
import com.manhattan.busyness_predictor.dto.SignUpRequest;
import com.manhattan.busyness_predictor.dto.UpdateProfileRequest;
import com.manhattan.busyness_predictor.dto.UserDto;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.UserRepository;
import com.manhattan.busyness_predictor.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtTokenProvider jwtTokenProvider;

    @InjectMocks
    private AuthService authService;

    private User testUser;
    private SignUpRequest signUpRequest;
    private LoginRequest loginRequest;
    private UpdateProfileRequest updateProfileRequest;

    @BeforeEach
    void setUp() {
        // Create test user
        testUser = new User();
        testUser.setId(1);
        testUser.setUsername("testuser");
        testUser.setEmail("test@example.com");
        testUser.setPassword("hashedPassword");
        testUser.setFirstName("Test");
        testUser.setLastName("User");
        testUser.setPhoneNumber("1234567890");
        testUser.setCreatedAt(LocalDateTime.now());
        testUser.setUpdatedAt(LocalDateTime.now());

        // Create test signup request
        signUpRequest = new SignUpRequest();
        signUpRequest.setUsername("testuser");
        signUpRequest.setEmail("test@example.com");
        signUpRequest.setPassword("password123");
        signUpRequest.setFirstName("Test");
        signUpRequest.setLastName("User");
        signUpRequest.setPhoneNumber("1234567890");

        // Create test login request
        loginRequest = new LoginRequest();
        loginRequest.setUsernameOrEmail("testuser");
        loginRequest.setPassword("password123");

        // Create test update profile request
        updateProfileRequest = new UpdateProfileRequest();
        updateProfileRequest.setFirstName("Updated");
        updateProfileRequest.setLastName("Name");
        updateProfileRequest.setEmail("updated@example.com");
        updateProfileRequest.setUsername("updateduser");
        updateProfileRequest.setPhoneNumber("9876543210");
    }

    @Test
    void whenSignUp_withValidRequest_thenReturnAuthResponse() {
        // Given
        when(userRepository.existsByUsername("testuser")).thenReturn(false);
        when(userRepository.existsByEmail("test@example.com")).thenReturn(false);
        when(passwordEncoder.encode("password123")).thenReturn("hashedPassword");
        when(userRepository.save(any(User.class))).thenReturn(testUser);
        when(jwtTokenProvider.generateToken(any())).thenReturn("jwt-token");

        // When
        AuthResponse result = authService.signUp(signUpRequest);

        // Then
        assertNotNull(result);
        assertNotNull(result.getUser());
        assertEquals("testuser", result.getUser().getUsername());
        assertEquals("test@example.com", result.getUser().getEmail());
        assertEquals("jwt-token", result.getToken());

        verify(userRepository).existsByUsername("testuser");
        verify(userRepository).existsByEmail("test@example.com");
        verify(passwordEncoder).encode("password123");
        verify(userRepository).save(any(User.class));
        verify(jwtTokenProvider).generateToken(any());
    }

    @Test
    void whenSignUp_withExistingUsername_thenThrowException() {
        // Given
        when(userRepository.existsByUsername("testuser")).thenReturn(true);

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> authService.signUp(signUpRequest));
        assertEquals("Username is already taken", exception.getMessage());

        verify(userRepository).existsByUsername("testuser");
        verify(userRepository, never()).existsByEmail(any());
        verify(userRepository, never()).save(any());
    }

    @Test
    void whenSignUp_withExistingEmail_thenThrowException() {
        // Given
        when(userRepository.existsByUsername("testuser")).thenReturn(false);
        when(userRepository.existsByEmail("test@example.com")).thenReturn(true);

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> authService.signUp(signUpRequest));
        assertEquals("Email is already registered", exception.getMessage());

        verify(userRepository).existsByUsername("testuser");
        verify(userRepository).existsByEmail("test@example.com");
        verify(userRepository, never()).save(any());
    }

    @Test
    void whenLogin_withValidCredentials_thenReturnAuthResponse() {
        // Given
        when(userRepository.findByUsernameOrEmail("testuser", "testuser")).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches("password123", "hashedPassword")).thenReturn(true);
        when(jwtTokenProvider.generateToken(any())).thenReturn("jwt-token");

        // When
        AuthResponse result = authService.logIn(loginRequest);

        // Then
        assertNotNull(result);
        assertNotNull(result.getUser());
        assertEquals("testuser", result.getUser().getUsername());
        assertEquals("jwt-token", result.getToken());

        verify(userRepository).findByUsernameOrEmail("testuser", "testuser");
        verify(passwordEncoder).matches("password123", "hashedPassword");
        verify(jwtTokenProvider).generateToken(any());
    }

    @Test
    void whenLogin_withInvalidUser_thenThrowException() {
        // Given
        when(userRepository.findByUsernameOrEmail("nonexistent", "nonexistent")).thenReturn(Optional.empty());

        LoginRequest invalidRequest = new LoginRequest();
        invalidRequest.setUsernameOrEmail("nonexistent");
        invalidRequest.setPassword("password123");

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> authService.logIn(invalidRequest));
        assertEquals("Invalid credentials", exception.getMessage());

        verify(userRepository).findByUsernameOrEmail("nonexistent", "nonexistent");
        verify(passwordEncoder, never()).matches(any(), any());
    }

    @Test
    void whenLogin_withInvalidPassword_thenThrowException() {
        // Given
        when(userRepository.findByUsernameOrEmail("testuser", "testuser")).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches("wrongpassword", "hashedPassword")).thenReturn(false);

        LoginRequest invalidRequest = new LoginRequest();
        invalidRequest.setUsernameOrEmail("testuser");
        invalidRequest.setPassword("wrongpassword");

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> authService.logIn(invalidRequest));
        assertEquals("Invalid credentials", exception.getMessage());

        verify(userRepository).findByUsernameOrEmail("testuser", "testuser");
        verify(passwordEncoder).matches("wrongpassword", "hashedPassword");
        verify(jwtTokenProvider, never()).generateToken(any());
    }

    @Test
    void whenUpdateProfile_withValidRequest_thenReturnUpdatedUser() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(userRepository.existsByEmail("updated@example.com")).thenReturn(false);
        when(userRepository.existsByUsername("updateduser")).thenReturn(false);
        when(userRepository.save(any(User.class))).thenReturn(testUser);

        // When
        UserDto result = authService.updateProfile(1, updateProfileRequest);

        // Then
        assertNotNull(result);
        verify(userRepository).findById(1);
        verify(userRepository).existsByEmail("updated@example.com");
        verify(userRepository).existsByUsername("updateduser");
        verify(userRepository).save(any(User.class));
    }

    @Test
    void whenUpdateProfile_withNonExistentUser_thenThrowException() {
        // Given
        when(userRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> authService.updateProfile(999, updateProfileRequest));
        assertEquals("User not found", exception.getMessage());

        verify(userRepository).findById(999);
        verify(userRepository, never()).save(any());
    }

    @Test
    void whenUpdateProfile_withExistingEmail_thenThrowException() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(userRepository.existsByEmail("updated@example.com")).thenReturn(true);

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> authService.updateProfile(1, updateProfileRequest));
        assertEquals("Email is already registered", exception.getMessage());

        verify(userRepository).findById(1);
        verify(userRepository).existsByEmail("updated@example.com");
        verify(userRepository, never()).save(any());
    }

    @Test
    void whenUpdateProfile_withExistingUsername_thenThrowException() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(userRepository.existsByEmail("updated@example.com")).thenReturn(false);
        when(userRepository.existsByUsername("updateduser")).thenReturn(true);

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> authService.updateProfile(1, updateProfileRequest));
        assertEquals("Username is already taken", exception.getMessage());

        verify(userRepository).findById(1);
        verify(userRepository).existsByEmail("updated@example.com");
        verify(userRepository).existsByUsername("updateduser");
        verify(userRepository, never()).save(any());
    }

    @Test
    void whenUpdateProfile_withPasswordChange_thenUpdatePassword() {
        // Given
        UpdateProfileRequest requestWithPassword = new UpdateProfileRequest();
        requestWithPassword.setCurrentPassword("password123");
        requestWithPassword.setNewPassword("newpassword123");
        requestWithPassword.setFirstName("Updated");

        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches("password123", "hashedPassword")).thenReturn(true);
        when(passwordEncoder.encode("newpassword123")).thenReturn("newHashedPassword");
        when(userRepository.save(any(User.class))).thenReturn(testUser);

        // When
        UserDto result = authService.updateProfile(1, requestWithPassword);

        // Then
        assertNotNull(result);
        verify(passwordEncoder).matches("password123", "hashedPassword");
        verify(passwordEncoder).encode("newpassword123");
        verify(userRepository).save(any(User.class));
    }

    @Test
    void whenUpdateProfile_withPasswordChangeButNoCurrentPassword_thenThrowException() {
        // Given
        UpdateProfileRequest requestWithPassword = new UpdateProfileRequest();
        requestWithPassword.setNewPassword("newpassword123");

        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> authService.updateProfile(1, requestWithPassword));
        assertEquals("Current password is required to update password", exception.getMessage());

        verify(userRepository).findById(1);
        verify(userRepository, never()).save(any());
    }

    @Test
    void whenUpdateProfile_withIncorrectCurrentPassword_thenThrowException() {
        // Given
        UpdateProfileRequest requestWithPassword = new UpdateProfileRequest();
        requestWithPassword.setCurrentPassword("wrongpassword");
        requestWithPassword.setNewPassword("newpassword123");

        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches("wrongpassword", "hashedPassword")).thenReturn(false);

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> authService.updateProfile(1, requestWithPassword));
        assertEquals("Current password is incorrect", exception.getMessage());

        verify(userRepository).findById(1);
        verify(passwordEncoder).matches("wrongpassword", "hashedPassword");
        verify(userRepository, never()).save(any());
    }

    @Test
    void whenUpdateProfile_withSameEmailAndUsername_thenUpdateSuccessfully() {
        // Given
        UpdateProfileRequest sameDataRequest = new UpdateProfileRequest();
        sameDataRequest.setEmail("test@example.com"); // Same as current
        sameDataRequest.setUsername("testuser"); // Same as current
        sameDataRequest.setFirstName("Updated");

        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(userRepository.existsByEmail("test@example.com")).thenReturn(true); // Should pass because it's the same user
        when(userRepository.existsByUsername("testuser")).thenReturn(true); // Should pass because it's the same user
        when(userRepository.save(any(User.class))).thenReturn(testUser);

        // When
        UserDto result = authService.updateProfile(1, sameDataRequest);

        // Then
        assertNotNull(result);
        verify(userRepository).save(any(User.class));
    }

    @Test
    void whenUpdateProfile_withEmptyFields_thenSkipEmptyFields() {
        // Given
        UpdateProfileRequest emptyFieldsRequest = new UpdateProfileRequest();
        emptyFieldsRequest.setFirstName(""); // Empty
        emptyFieldsRequest.setLastName("   "); // Whitespace only
        emptyFieldsRequest.setEmail("updated@example.com");

        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(userRepository.existsByEmail("updated@example.com")).thenReturn(false);
        when(userRepository.save(any(User.class))).thenReturn(testUser);

        // When
        UserDto result = authService.updateProfile(1, emptyFieldsRequest);

        // Then
        assertNotNull(result);
        verify(userRepository).save(any(User.class));
        // Should not update empty/whitespace fields
    }

    @Test
    void whenGetUserById_withValidId_thenReturnUserDto() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));

        // When
        UserDto result = authService.getUserById(1);

        // Then
        assertNotNull(result);
        assertEquals("testuser", result.getUsername());
        assertEquals("test@example.com", result.getEmail());
        verify(userRepository).findById(1);
    }

    @Test
    void whenGetUserById_withInvalidId_thenThrowException() {
        // Given
        when(userRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> authService.getUserById(999));
        assertEquals("User not found", exception.getMessage());

        verify(userRepository).findById(999);
    }

    @Test
    void whenUpdateUserAvatar_withValidId_thenReturnUpdatedUser() {
        // Given
        String avatarUrl = "/avatars/avatar_user_1_123456789.jpg";
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(userRepository.save(any(User.class))).thenReturn(testUser);

        // When
        UserDto result = authService.updateUserAvatar(1, avatarUrl);

        // Then
        assertNotNull(result);
        verify(userRepository).findById(1);
        verify(userRepository).save(any(User.class));
    }

    @Test
    void whenUpdateUserAvatar_withInvalidId_thenThrowException() {
        // Given
        when(userRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> authService.updateUserAvatar(999, "/avatars/test.jpg"));
        assertEquals("User not found", exception.getMessage());

        verify(userRepository).findById(999);
        verify(userRepository, never()).save(any());
    }

    @Test
    void whenUpdateUserAvatar_withNullUrl_thenUpdateToNull() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(userRepository.save(any(User.class))).thenReturn(testUser);

        // When
        UserDto result = authService.updateUserAvatar(1, null);

        // Then
        assertNotNull(result);
        verify(userRepository).findById(1);
        verify(userRepository).save(any(User.class));
    }
}