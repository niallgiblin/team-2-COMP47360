package com.manhattan.busyness_predictor.dto;

import com.manhattan.busyness_predictor.model.User;

public class AuthResponse {

    private User user;
    private String token;

    // Constructors
    public AuthResponse() {
    }

    public AuthResponse(User user, String token) {
        this.user = user;
        this.token = token;
    }

    // Getters and Setters
    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }
}
