package com.manhattan.busyness_predictor.dto;

import java.time.LocalDateTime;
import java.util.List;

public class PlanResponse {
    private Integer id;
    private String name;
    private LocalDateTime createdAt;
    private List<LocationDto> venues;

    public PlanResponse() {
    }

    public PlanResponse(Integer id, String name, LocalDateTime createdAt, List<LocationDto> venues) {
        this.id = id;
        this.name = name;
        this.createdAt = createdAt;
        this.venues = venues;
    }

    // Getters and Setters
    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public List<LocationDto> getVenues() {
        return venues;
    }

    public void setVenues(List<LocationDto> venues) {
        this.venues = venues;
    }
}