package com.manhattan.busyness_predictor.dto;

import jakarta.validation.constraints.NotNull;

public class ShareRequest {

    @NotNull(message = "Receiver ID is required")
    private Integer receiverId;

    private String message; // Optional message with the share

    // Constructors
    public ShareRequest() {
    }

    public ShareRequest(Integer receiverId, String message) {
        this.receiverId = receiverId;
        this.message = message;
    }

    // Getters and Setters
    public Integer getReceiverId() {
        return receiverId;
    }

    public void setReceiverId(Integer receiverId) {
        this.receiverId = receiverId;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
