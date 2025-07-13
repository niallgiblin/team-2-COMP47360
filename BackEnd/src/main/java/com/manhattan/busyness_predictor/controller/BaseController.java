package com.manhattan.busyness_predictor.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.userdetails.UserDetails;

import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.UserRepository;

/**
 * A base controller that provides utility methods for other controllers,
 * such as retrieving the currently authenticated user.
 */
public abstract class BaseController {

    @Autowired
    private UserRepository userRepository;

    protected User getCurrentUser(UserDetails userDetails) {
        return userRepository.findByUsername(userDetails.getUsername())
                .orElseThrow(() -> new RuntimeException("Authenticated user not found with username: " + userDetails.getUsername()));
    }
}