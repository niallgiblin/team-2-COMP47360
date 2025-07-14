package com.manhattan.busyness_predictor.dto;

import java.time.LocalDateTime;

import com.manhattan.busyness_predictor.model.Review;

public class ReviewDto {
    private Integer id;
    private String reviewText;
    private Float reviewVal;
    private LocalDateTime timestamp;
    private UserSummaryDto user;

    public ReviewDto(Review review) {
        this.id = review.getId();
        this.reviewText = review.getReviewText();
        this.reviewVal = review.getReviewVal();
        this.timestamp = review.getTimestamp();
        this.user = UserSummaryDto.fromUser(review.getUser());
    }

    // Getters and Setters
    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }

    public String getReviewText() { return reviewText; }
    public void setReviewText(String reviewText) { this.reviewText = reviewText; }

    public Float getReviewVal() { return reviewVal; }
    public void setReviewVal(Float reviewVal) { this.reviewVal = reviewVal; }

    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }

    public UserSummaryDto getUser() { return user; }
    public void setUser(UserSummaryDto user) { this.user = user; }
}