package com.manhattan.busyness_predictor.dto;

import java.time.LocalDateTime;
import java.util.List;

public class CreatePlanRequest {
    private LocalDateTime date;
    private List<Integer> locationIds;
    private List<LocalDateTime> locationTimes;

    public CreatePlanRequest() {
    }

    public CreatePlanRequest(LocalDateTime date, List<Integer> locationIds, List<LocalDateTime> locationTimes) {
        this.date = date;
        this.locationIds = locationIds;
        this.locationTimes = locationTimes;
    }

    // Getters and Setters
    public LocalDateTime getDate() {
        return date;
    }

    public void setDate(LocalDateTime date) {
        this.date = date;
    }

    public List<Integer> getLocationIds() {
        return locationIds;
    }

    public void setLocationIds(List<Integer> locationIds) {
        this.locationIds = locationIds;
    }

    public List<LocalDateTime> getLocationTimes() {
        return locationTimes;
    }

    public void setLocationTimes(List<LocalDateTime> locationTimes) {
        this.locationTimes = locationTimes;
    }
}
