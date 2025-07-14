package com.manhattan.busyness_predictor.dto;

public class AuthResponse {

    private UserDto user;
    private String token;

    // Constructors
    public AuthResponse() {
    }

    public AuthResponse(UserDto user, String token) {
        this.user = user;
        this.token = token;
    }

    // Getters and Setters
    public UserDto getUser() {
        return user;
    }

    public void setUser(UserDto user) {
        this.user = user;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }
}
