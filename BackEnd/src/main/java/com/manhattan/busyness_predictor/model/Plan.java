package com.manhattan.busyness_predictor.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "plan")
public class Plan {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Column(name = "date")
    private LocalDateTime date;

    @Column(name = "created_by")
    private Integer createdBy;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "location_1")
    private Integer loc1;

    @Column(name = "location_2")
    private Integer loc2;

    @Column(name = "location_3")
    private Integer loc3;

    // Constructors
    public Plan() {
    }

    public Plan(LocalDateTime date, Integer createdBy, LocalDateTime createdAt) {
        this.date = date;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
    }

    // Getters and Setters
    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public LocalDateTime getDate() {
        return date;
    }

    public void setDate(LocalDateTime date) {
        this.date = date;
    }

    public Integer getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(Integer createdBy) {
        this.createdBy = createdBy;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public Integer getLoc1() {
        return loc1;
    }

    public void setLoc1(Integer loc1) {
        this.loc1 = loc1;
    }

    public Integer getLoc2() {
        return loc2;
    }

    public void setLoc2(Integer loc2) {
        this.loc2 = loc2;
    }

    public Integer getLoc3() {
        return loc3;
    }

    public void setLoc3(Integer loc3) {
        this.loc3 = loc3;
    }
}