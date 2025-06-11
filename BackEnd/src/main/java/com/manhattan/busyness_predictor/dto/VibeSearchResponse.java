package com.manhattan.busyness_predictor.dto;

import java.util.List;

import com.manhattan.busyness_predictor.model.Location;

public class VibeSearchResponse {

    private List<Location> locations;
    private String explanation;
    private String searchQuery;
    private Double confidence;

    // Constructors
    public VibeSearchResponse() {
    }

    public VibeSearchResponse(List<Location> locations, String explanation) {
        this.locations = locations;
        this.explanation = explanation;
    }

    // Getters and Setters
    public List<Location> getLocations() {
        return locations;
    }

    public void setLocations(List<Location> locations) {
        this.locations = locations;
    }

    public String getExplanation() {
        return explanation;
    }

    public void setExplanation(String explanation) {
        this.explanation = explanation;
    }

    public String getSearchQuery() {
        return searchQuery;
    }

    public void setSearchQuery(String searchQuery) {
        this.searchQuery = searchQuery;
    }

    public Double getConfidence() {
        return confidence;
    }

    public void setConfidence(Double confidence) {
        this.confidence = confidence;
    }
}
