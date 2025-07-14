package com.manhattan.busyness_predictor.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.manhattan.busyness_predictor.dto.UserDto;
import com.manhattan.busyness_predictor.security.UserPrincipal;

@RestController
@RequestMapping("/api/users")
public class UserController {

    /**
     * Gets the profile of the currently authenticated user.
     *
     * @param currentUser The principal of the authenticated user.
     * @return The full User object.
     */
    @GetMapping("/me")
    public ResponseEntity<UserDto> getCurrentUser(@AuthenticationPrincipal UserPrincipal currentUser) {
        if (currentUser == null) {
            return ResponseEntity.status(401).build();
        }
        UserDto userDto = UserDto.fromUser(currentUser.getUser());
        return ResponseEntity.ok(userDto);
    }
}