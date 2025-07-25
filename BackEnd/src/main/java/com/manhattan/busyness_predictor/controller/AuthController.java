package com.manhattan.busyness_predictor.controller;

import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import java.io.File;
import java.io.IOException;
import com.manhattan.busyness_predictor.model.User;
import org.springframework.web.bind.annotation.RestController;

import com.manhattan.busyness_predictor.dto.AuthResponse;
import com.manhattan.busyness_predictor.dto.LoginRequest;
import com.manhattan.busyness_predictor.dto.SignUpRequest;
import com.manhattan.busyness_predictor.dto.UpdateProfileRequest;
import com.manhattan.busyness_predictor.dto.UserDto;
import com.manhattan.busyness_predictor.security.UserPrincipal;
import com.manhattan.busyness_predictor.service.AuthService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    @PostMapping("/signup")
    public ResponseEntity<Map<String, Object>> signUp(@Valid @RequestBody SignUpRequest request) {
        AuthResponse authResponse = authService.signUp(request);

        Map<String, Object> response = new HashMap<>();
        response.put("message", "User registered successfully");
        response.put("user", authResponse.getUser());
        response.put("token", authResponse.getToken());

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> logIn(@Valid @RequestBody LoginRequest request) {
        AuthResponse authResponse = authService.logIn(request);

        Map<String, Object> response = new HashMap<>();
        response.put("message", "Login successful");
        response.put("user", authResponse.getUser());
        response.put("token", authResponse.getToken());

        return ResponseEntity.ok(response);
    }

    @PutMapping("/profile/{userId}")
    public ResponseEntity<Map<String, Object>> alterProfileById(
            @PathVariable Integer userId,
            @Valid @RequestBody UpdateProfileRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        if (!currentUser.getId().equals(userId)) {
            // This should ideally be handled by a more specific exception and handler
            throw new RuntimeException("You are not authorized to update this profile. You can only update your own.");
        }
        UserDto updatedUser = authService.updateProfile(userId, request);

        Map<String, Object> response = new HashMap<>();
        response.put("message", "Profile updated successfully");
        response.put("user", updatedUser);

        return ResponseEntity.ok(response);
    }

    @PostMapping("/profile/{userId}/avatar")
    public ResponseEntity<Map<String, Object>> uploadAvatar(
            @PathVariable Integer userId,
            @RequestParam("avatar") MultipartFile avatarFile,
            @AuthenticationPrincipal UserPrincipal currentUser) throws IOException {
        if (!currentUser.getId().equals(userId)) {
            throw new RuntimeException("You are not authorized to update this profile. You can only update your own.");
        }
        if (avatarFile.isEmpty()) {
            throw new RuntimeException("No file uploaded");
        }
        // Save file to avatars directory
        String avatarsDir = System.getProperty("user.dir") + "/backend/avatars/";
        File dir = new File(avatarsDir);
        if (!dir.exists()) dir.mkdirs();
        String extension = avatarFile.getOriginalFilename().substring(avatarFile.getOriginalFilename().lastIndexOf('.'));
        String filename = "avatar_user_" + userId + System.currentTimeMillis() + extension;
        File dest = new File(dir, filename);
        avatarFile.transferTo(dest);
        // Build public URL (assuming static serving from /avatars/)
        String avatarUrl = "/avatars/" + filename;
        // Update user
        UserDto updatedUser = authService.updateUserAvatar(userId, avatarUrl);
        Map<String, Object> response = new HashMap<>();
        response.put("message", "Avatar uploaded successfully");
        response.put("user", updatedUser);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/profile/{userId}/avatar")
    public ResponseEntity<Map<String, Object>> deleteAvatar(
            @PathVariable Integer userId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        if (!currentUser.getId().equals(userId)) {
            throw new RuntimeException("You are not authorized to update this profile. You can only update your own.");
        }
        // Remove avatar file if it exists
        UserDto user = authService.getUserById(userId);
        if (user.getAvatarUrl() != null && !user.getAvatarUrl().isEmpty()) {
            String filePath = System.getProperty("user.dir") + user.getAvatarUrl();
            java.io.File file = new java.io.File(filePath);
            if (file.exists())
                file.delete();
        }
        // Remove avatarUrl from user
        UserDto updatedUser = authService.updateUserAvatar(userId, null);
        Map<String, Object> response = new HashMap<>();
        response.put("message", "Avatar deleted successfully");
        response.put("user", updatedUser);
        return ResponseEntity.ok(response);
    }

    /**
     * Endpoint to get the currently authenticated user's details.
     * This is used by the frontend to validate the token on initial load.
     *
     * @param currentUser The principal of the authenticated user.
     * @return The User object for the authenticated user.
     */
    @GetMapping("/me")
    public ResponseEntity<UserDto> getMe(@AuthenticationPrincipal UserPrincipal currentUser) {
        if (currentUser == null) {
            return ResponseEntity.status(401).build();
        }
        UserDto userDto = UserDto.fromUser(currentUser.getUser());
        return ResponseEntity.ok(userDto);
    }
}