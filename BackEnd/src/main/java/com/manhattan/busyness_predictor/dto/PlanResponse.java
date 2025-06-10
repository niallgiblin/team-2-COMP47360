package com.manhattan.busyness_predictor.dto;

import java.time.LocalDateTime;
import java.util.List;

public class PlanResponse {
    private Integer id;
    private LocalDateTime date;
    private Integer createdBy;
    private LocalDateTime createdAt;
    private List<PlanLocationInfo> locations;
    private List<Integer> sharedWith;

    public PlanResponse() {
    }

    public PlanResponse(Integer id, LocalDateTime date, Integer createdBy, LocalDateTime createdAt,
            List<PlanLocationInfo> locations, List<Integer> sharedWith) {
        this.id = id;
        this.date = date;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
        this.locations = locations;
        this.sharedWith = sharedWith;
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

    public List<PlanLocationInfo> getLocations() {
        return locations;
    }

    public void setLocations(List<PlanLocationInfo> locations) {
        this.locations = locations;
    }

    public List<Integer> getSharedWith() {
        return sharedWith;
    }

    public void setSharedWith(List<Integer> sharedWith) {
        this.sharedWith = sharedWith;
    }

    // Inner class for location information in plans
    public static class PlanLocationInfo {
        private Integer locationId;
        private String locationName;
        private String address;
        private LocalDateTime scheduledTime;

        public PlanLocationInfo() {
        }

        public PlanLocationInfo(Integer locationId, String locationName, String address, LocalDateTime scheduledTime) {
            this.locationId = locationId;
            this.locationName = locationName;
            this.address = address;
            this.scheduledTime = scheduledTime;
        }

        // Getters and Setters
        public Integer getLocationId() {
            return locationId;
        }

        public void setLocationId(Integer locationId) {
            this.locationId = locationId;
        }

        public String getLocationName() {
            return locationName;
        }

        public void setLocationName(String locationName) {
            this.locationName = locationName;
        }

        public String getAddress() {
            return address;
        }

        public void setAddress(String address) {
            this.address = address;
        }

        public LocalDateTime getScheduledTime() {
            return scheduledTime;
        }

        public void setScheduledTime(LocalDateTime scheduledTime) {
            this.scheduledTime = scheduledTime;
        }
    }
}