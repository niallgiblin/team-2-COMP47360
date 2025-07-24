package com.manhattan.busyness_predictor.dto;

import com.manhattan.busyness_predictor.model.User;

public class UserSummaryDto {
    private Integer id;
    private String username;
    private String name;
    private String avatarUrl;

    public UserSummaryDto(Integer id, String username, String name, String avatarUrl) {
        this.id = id;
        this.username = username;
        this.name = name;
        this.avatarUrl = avatarUrl;
    }

    public static UserSummaryDto fromUser(User user) {
        return new UserSummaryDto(user.getId(), user.getUsername(), user.getName(), user.getAvatarUrl());
    }

    // Getters and Setters
    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }
}