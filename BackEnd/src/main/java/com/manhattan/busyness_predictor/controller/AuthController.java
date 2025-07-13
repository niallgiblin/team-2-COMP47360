package com.manhattan.busyness_predictor.controller;

import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.manhattan.busyness_predictor.dto.AuthResponse;
import com.manhattan.busyness_predictor.dto.LoginRequest;
import com.manhattan.busyness_predictor.dto.SignUpRequest;
import com.manhattan.busyness_predictor.dto.UpdateProfileRequest;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.service.AuthService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController extends BaseController {

    @Autowired
    private AuthService authService;

    @PostMapping("/signup")
    public ResponseEntity<Map<String, Object>> signUp(@Valid @RequestBody SignUpRequest request) {
        try {
            AuthResponse authResponse = authService.signUp(request);

            Map<String, Object> response = new HashMap<>();
            response.put("message", "User registered successfully");
            response.put("user", authResponse.getUser());
            response.put("token", authResponse.getToken());

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> logIn(@Valid @RequestBody LoginRequest request) {
        try {
            AuthResponse authResponse = authService.logIn(request);

            Map<String, Object> response = new HashMap<>();
            response.put("message", "Login successful");
            response.put("user", authResponse.getUser());
            response.put("token", authResponse.getToken());

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @PutMapping("/profile/{userId}")
    public ResponseEntity<Map<String, Object>> alterProfileById(
            @PathVariable Integer userId,
            @Valid @RequestBody UpdateProfileRequest request,
            @AuthenticationPrincipal UserDetails currentUserDetails) {
        try {
            User currentUser = getCurrentUser(currentUserDetails);
            if (!currentUser.getId().equals(userId)) {
                throw new IllegalAccessException("You are not authorized to update this profile. You can only update your own.");
            }
            User updatedUser = authService.updateProfile(currentUser.getId(), request);

            Map<String, Object> response = new HashMap<>();
            response.put("message", "Profile updated successfully");
            response.put("user", updatedUser);

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }
}