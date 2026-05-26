package com.manhattan.busyness_predictor.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class VibeSearchRequest {

    @NotBlank(message = "Vibe description is required")
    @Size(max = 500, message = "Vibe description cannot exceed 500 characters")
    private String vibeDescription;

    @Min(value = 1, message = "maxResults must be at least 1")
    @Max(value = 25, message = "maxResults must not exceed 25")
    private Integer maxResults = 10;
    
    private String location; // Optional: "Manhattan", "Downtown", etc.
    
    private String priceRange; // Optional: "budget", "mid", "luxury"
    
    private String timeOfDay; // Optional: "morning", "afternoon", "evening", "night"

    // Constructors
    public VibeSearchRequest() {
    }

    public VibeSearchRequest(String vibeDescription) {
        this.vibeDescription = vibeDescription;
    }

    // Getters and Setters
    public String getVibeDescription() {
        return vibeDescription;
    }

    public void setVibeDescription(String vibeDescription) {
        this.vibeDescription = vibeDescription;
    }

    public Integer getMaxResults() {
        return maxResults;
    }

    public void setMaxResults(Integer maxResults) {
        this.maxResults = maxResults;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public String getPriceRange() {
        return priceRange;
    }

    public void setPriceRange(String priceRange) {
        this.priceRange = priceRange;
    }

    public String getTimeOfDay() {
        return timeOfDay;
    }

    public void setTimeOfDay(String timeOfDay) {
        this.timeOfDay = timeOfDay;
    }
}
