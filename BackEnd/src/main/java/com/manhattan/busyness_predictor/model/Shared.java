package com.manhattan.busyness_predictor.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "Shared")
public class Shared {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "Id")
    private Long id;

    @Column(name = "sender")
    private Long senderId;

    @Column(name = "receiver")
    private Long receiverId;

    @Column(name = "LocationId")
    private Long locationId;

    @Column(name = "SharedAt")
    private LocalDateTime sharedAt;

    // Constructors
    public Shared() {
    }

    public Shared(Long senderId, Long receiverId, Long locationId) {
        this.senderId = senderId;
        this.receiverId = receiverId;
        this.locationId = locationId;
        this.sharedAt = LocalDateTime.now();
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getSenderId() {
        return senderId;
    }

    public void setSenderId(Long senderId) {
        this.senderId = senderId;
    }

    public Long getReceiverId() {
        return receiverId;
    }

    public void setReceiverId(Long receiverId) {
        this.receiverId = receiverId;
    }

    public Long getLocationId() {
        return locationId;
    }

    public void setLocationId(Long locationId) {
        this.locationId = locationId;
    }

    public LocalDateTime getSharedAt() {
        return sharedAt;
    }

    public void setSharedAt(LocalDateTime sharedAt) {
        this.sharedAt = sharedAt;
    }
}
