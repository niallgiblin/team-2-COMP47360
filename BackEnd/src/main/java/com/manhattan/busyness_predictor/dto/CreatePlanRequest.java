package com.manhattan.busyness_predictor.dto;

import java.util.List;

public class CreatePlanRequest {
    private String name;
    private List<Integer> locationIds;

    public CreatePlanRequest() {
    }

    public CreatePlanRequest(String name, List<Integer> locationIds) {
        this.name = name;
        this.locationIds = locationIds;
    }

    // Getters and Setters
    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public List<Integer> getLocationIds() {
        return locationIds;
    }

    public void setLocationIds(List<Integer> locationIds) {
        this.locationIds = locationIds;
    }
}