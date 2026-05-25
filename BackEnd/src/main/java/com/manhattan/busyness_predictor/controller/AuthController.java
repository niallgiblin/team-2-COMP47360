package com.manhattan.busyness_predictor.controller;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.Map;

import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.manhattan.busyness_predictor.dto.AuthResponse;
import com.manhattan.busyness_predictor.dto.LoginRequest;
import com.manhattan.busyness_predictor.dto.SignUpRequest;
import com.manhattan.busyness_predictor.dto.UpdateProfileRequest;
import com.manhattan.busyness_predictor.dto.UserDto;
import com.manhattan.busyness_predictor.security.UserPrincipal;
import com.manhattan.busyness_predictor.service.AuthService;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    @Value("${app.avatars.dir}")
    private String avatarsDir;

    @PostMapping("/signup")
    public ResponseEntity<Map<String, Object>> signUp(
            @Valid @RequestBody SignUpRequest request
    ) {
        AuthResponse authResponse = authService.signUp(request);

        Map<String, Object> response = new HashMap<>();
        response.put("message", "User registered successfully");
        response.put("user",    authResponse.getUser());
        response.put("token",   authResponse.getToken());

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> logIn(
            @Valid @RequestBody LoginRequest request
    ) {
        AuthResponse authResponse = authService.logIn(request);

        Map<String, Object> response = new HashMap<>();
        response.put("message", "Login successful");
        response.put("user",    authResponse.getUser());
        response.put("token",   authResponse.getToken());

        return ResponseEntity.ok(response);
    }

    @GetMapping("/me")
    public ResponseEntity<UserDto> getMe(
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        UserDto dto = UserDto.fromUser(currentUser.getUser());
        return ResponseEntity.ok(dto);
    }

    @PutMapping("/profile/{userId}")
    public ResponseEntity<Map<String, Object>> alterProfileById(
            @PathVariable Integer userId,
            @Valid @RequestBody UpdateProfileRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (!currentUser.getId().equals(userId)) {
            throw new RuntimeException("You are not authorized to update this profile. You can only update your own.");
        }

        UserDto updatedUser = authService.updateProfile(userId, request);

        Map<String, Object> response = new HashMap<>();
        response.put("message", "Profile updated successfully");
        response.put("user",    updatedUser);

        return ResponseEntity.ok(response);
    }

    @PostMapping("/profile/{userId}/avatar")
    public ResponseEntity<Map<String, Object>> uploadAvatar(
            @PathVariable Integer userId,
            @RequestParam("avatar") MultipartFile avatarFile,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) throws IOException {
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (!currentUser.getId().equals(userId)) {
            throw new RuntimeException("You are not authorized to update this profile. You can only update your own.");
        }
        if (avatarFile.isEmpty()) {
            throw new RuntimeException("No file uploaded");
        }

        File dir = new File(avatarsDir);
        if (!dir.exists()) {
            boolean created = dir.mkdirs();
            if (!created) {
                throw new RuntimeException("Failed to create avatars directory");
            }
        }

        // Validate file type
        String contentType = avatarFile.getContentType();
        if (contentType == null || (!contentType.startsWith("image/"))) {
            throw new RuntimeException("File must be an image");
        }

        String original = avatarFile.getOriginalFilename();
        String ext = (original != null && original.contains("."))
                   ? original.substring(original.lastIndexOf('.'))
                   : ".jpg";
        
        String filename = "avatar_user_" + userId + "_" + System.currentTimeMillis() + ext;
        File dest = new File(dir, filename);
        
        try {
            avatarFile.transferTo(dest);
        } catch (IOException e) {
            throw new RuntimeException("Failed to save avatar file: " + e.getMessage());
        }

        String avatarUrl = "/avatars/" + filename;
        UserDto updatedUser = authService.updateUserAvatar(userId, avatarUrl);

        Map<String, Object> response = new HashMap<>();
        response.put("message", "Avatar uploaded successfully");
        response.put("user", updatedUser);

        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/profile/{userId}/avatar")
    public ResponseEntity<Map<String, Object>> deleteAvatar(
            @PathVariable Integer userId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (!currentUser.getId().equals(userId)) {
            throw new RuntimeException("You are not authorized to update this profile. You can only update your own.");
        }

        UserDto user = authService.getUserById(userId);
        String currentAvatarUrl = user.getAvatarUrl();
        
        // Delete the file if it exists
        if (currentAvatarUrl != null && currentAvatarUrl.startsWith("/avatars/")) {
            String filename = currentAvatarUrl.substring("/avatars/".length());
            File avatarFile = new File(avatarsDir, filename);
            if (avatarFile.exists()) {
                boolean deleted = avatarFile.delete();
                if (!deleted) {
                    // Log the failure but don't throw an exception
                    System.err.println("Failed to delete avatar file: " + avatarFile.getAbsolutePath());
                }
            }
        }

        UserDto updatedUser = authService.updateUserAvatar(userId, null);

        Map<String, Object> response = new HashMap<>();
        response.put("message", "Avatar deleted successfully");
        response.put("user", updatedUser);

        return ResponseEntity.ok(response);
    }
}
