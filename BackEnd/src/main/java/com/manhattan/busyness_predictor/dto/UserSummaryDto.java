package com.manhattan.busyness_predictor.dto;

import com.manhattan.busyness_predictor.model.User;

public class UserSummaryDto {
    private Integer id;
    private String username;
    private String name;

    public UserSummaryDto(Integer id, String username, String name) {
        this.id = id;
        this.username = username;
        this.name = name;
    }

    public static UserSummaryDto fromUser(User user) {
        return new UserSummaryDto(user.getId(), user.getUsername(), user.getName());
    }

    // Getters and Setters
    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
}