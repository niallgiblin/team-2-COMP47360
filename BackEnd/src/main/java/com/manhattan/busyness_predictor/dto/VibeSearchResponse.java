package com.manhattan.busyness_predictor.dto;

import java.util.List;
import java.util.Map;

import com.manhattan.busyness_predictor.model.Location;

public class VibeSearchResponse {

    private List<Location> locations;
    private String explanation;
    private double confidence;
    private Map<String, List<Double>> busyness;

    // Constructors
    public VibeSearchResponse() {
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

    public double getConfidence() {
        return confidence;
    }

    public void setConfidence(double confidence) {
        this.confidence = confidence;
    }

    public Map<String, List<Double>> getBusyness() {
        return busyness;
    }

    public void setBusyness(Map<String, List<Double>> busyness) {
        this.busyness = busyness;
    }
}
