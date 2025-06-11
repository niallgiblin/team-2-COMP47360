package com.manhattan.busyness_predictor.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "Reviews")
public class Review {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "Id")
    private Integer id;

    @Column(name = "Timestamp")
    private LocalDateTime timestamp;

    @Column(name = "UserId")
    private Integer userId;

    @Column(name = "LocId")
    private Integer locationId;

    @Column(name = "ReviewText")
    private String reviewText;

    @Column(name = "ReviewVal")
    private Float reviewVal;

    // Default constructor
    public Review() {
    }

    // Constructor
    public Review(Integer userId, Integer locationId, String reviewText, Float reviewVal) {
        this.userId = userId;
        this.locationId = locationId;
        this.reviewText = reviewText;
        this.reviewVal = reviewVal;
        this.timestamp = LocalDateTime.now();
    }

    // Getters and Setters
    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }

    public Integer getUserId() {
        return userId;
    }

    public void setUserId(Integer userId) {
        this.userId = userId;
    }

    public Integer getLocationId() {
        return locationId;
    }

    public void setLocationId(Integer locationId) {
        this.locationId = locationId;
    }

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
