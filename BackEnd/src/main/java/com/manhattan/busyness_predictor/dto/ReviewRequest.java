package com.manhattan.busyness_predictor.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public class ReviewRequest {

    @NotBlank(message = "Review text is required")
    @Size(max = 1000, message = "Review text cannot exceed 1000 characters")
    private String reviewText;

    @NotNull(message = "Review rating is required")
    @DecimalMin(value = "1.0", message = "Rating must be at least 1.0")
    @DecimalMax(value = "5.0", message = "Rating must be at most 5.0")
    private Float reviewVal;

    // Constructors
    public ReviewRequest() {
    }

    public ReviewRequest(String reviewText, Float reviewVal) {
        this.reviewText = reviewText;
        this.reviewVal = reviewVal;
    }

    // Getters and Setters
    public String getReviewText() {
        return reviewText;
    }

    public void setReviewText(String reviewText) {
        this.reviewText = reviewText;
    }

    public Float getReviewVal() {
        return reviewVal;
    }

    public void setReviewVal(Float reviewVal) {
        this.reviewVal = reviewVal;
    }
}