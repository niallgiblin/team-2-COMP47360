package com.manhattan.busyness_predictor.dto;

import java.util.List;
import java.util.Map;

public class VibeSearchResponse {

    private List<LocationDto> locations;
    private String explanation;
    private double confidence;
    private Map<String, Double> busyness;
    private Map<String, Object> predictions;

    // Getters and Setters
    public List<LocationDto> getLocations() {
        return locations;
    }

    public void setLocations(List<LocationDto> locations) {
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

    public Map<String, Double> getBusyness() {
        return busyness;
    }

    public void setBusyness(Map<String, Double> busyness) {
        this.busyness = busyness;
    }

    public Map<String, Object> getPredictions() {
        return predictions;
    }

    public void setPredictions(Map<String, Object> predictions) {
        this.predictions = predictions;
    }
}
