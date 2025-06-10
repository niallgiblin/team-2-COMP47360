package com.manhattan.busyness_predictor.dto;

import java.time.LocalDateTime;

public class AddPlaceToPlanRequest {
    private Integer planId;
    private Integer locationId;
    private LocalDateTime time;

    public AddPlaceToPlanRequest() {
    }

    public AddPlaceToPlanRequest(Integer planId, Integer locationId, LocalDateTime time) {
        this.planId = planId;
        this.locationId = locationId;
        this.time = time;
    }

    // Getters and Setters
    public Integer getPlanId() {
        return planId;
    }

    public void setPlanId(Integer planId) {
        this.planId = planId;
    }

    public Integer getLocationId() {
        return locationId;
    }

    public void setLocationId(Integer locationId) {
        this.locationId = locationId;
    }

    public LocalDateTime getTime() {
        return time;
    }

    public void setTime(LocalDateTime time) {
        this.time = time;
    }
}