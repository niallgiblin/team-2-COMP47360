package com.manhattan.busyness_predictor.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.UserRepository;

@RestController
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private UserRepository userRepository;

    /**
     * Gets the profile of the currently authenticated user.
     * The UserDetails object is automatically injected by Spring Security from the JWT.
     *
     * @param currentUserDetails The principal of the authenticated user.
     * @return The full User object.
     */
    @GetMapping("/me")
    public ResponseEntity<User> getCurrentUser(@AuthenticationPrincipal UserDetails currentUserDetails) {
        User user = userRepository.findByUsername(currentUserDetails.getUsername())
                .orElseThrow(() -> new RuntimeException("User not found with username: " + currentUserDetails.getUsername()));
        return ResponseEntity.ok(user);
    }
}