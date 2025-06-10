package com.manhattan.busyness_predictor.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "Friends")
public class Friend {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "Id")
    private Long id;

    @Column(name = "Timestamp")
    private LocalDateTime timestamp;

    @Column(name = "User1")
    private Long user1;

    @Column(name = "User2")
    private Long user2;

    // Constructors
    public Friend() {
    }

    public Friend(Long user1, Long user2) {
        // 确保 user1 总是较小的ID，保持一致性
        if (user1 < user2) {
            this.user1 = user1;
            this.user2 = user2;
        } else {
            this.user1 = user2;
            this.user2 = user1;
        }
        this.timestamp = LocalDateTime.now();
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }

    public Long getUser1() {
        return user1;
    }

    public void setUser1(Long user1) {
        this.user1 = user1;
    }

    public Long getUser2() {
        return user2;
    }

    public void setUser2(Long user2) {
        this.user2 = user2;
    }

    // Helper methods
    public Long getOtherUser(Long userId) {
        if (userId.equals(user1)) {
            return user2;
        } else if (userId.equals(user2)) {
            return user1;
        }
        return null;
    }

    public boolean containsUser(Long userId) {
        return userId.equals(user1) || userId.equals(user2);
    }
}