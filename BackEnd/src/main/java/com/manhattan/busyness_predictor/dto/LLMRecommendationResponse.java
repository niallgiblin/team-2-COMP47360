package com.manhattan.busyness_predictor.dto;

import java.util.List;

public class LLMRecommendationResponse {
    private List<Integer> locationIds;
    private String explanation;
    private Double confidence;

    // Constructors
    public LLMRecommendationResponse() {}

    public LLMRecommendationResponse(List<Integer> locationIds, String explanation, Double confidence) {
        this.locationIds = locationIds;
        this.explanation = explanation;
        this.confidence = confidence;
    }

    // Getters and Setters
    public List<Integer> getLocationIds() {
        return locationIds;
    }

    public void setLocationIds(List<Integer> locationIds) {
        this.locationIds = locationIds;
    }

    public String getExplanation() {
        return explanation;
    }

    public void setExplanation(String explanation) {
        this.explanation = explanation;
    }

    public Double getConfidence() {
        return confidence;
    }

    public void setConfidence(Double confidence) {
        this.confidence = confidence;
    }
}