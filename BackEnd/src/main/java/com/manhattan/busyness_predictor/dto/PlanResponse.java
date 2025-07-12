package com.manhattan.busyness_predictor.dto;

import java.time.LocalDateTime;
import java.util.List;

public class PlanResponse {
    private Integer id;
    private String name;
    private LocalDateTime createdAt;
    private List<VenueInfo> venues;

    public PlanResponse() {
    }

    public PlanResponse(Integer id, String name, LocalDateTime createdAt, List<VenueInfo> venues) {
        this.id = id;
        this.name = name;
        this.createdAt = createdAt;
        this.venues = venues;
    }

    // Getters and Setters
    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public List<VenueInfo> getVenues() {
        return venues;
    }

    public void setVenues(List<VenueInfo> venues) {
        this.venues = venues;
    }
// Inner class VenueInfo
    public static class VenueInfo {
        private Integer id;
        private String name;
        private String address;
        private String uri;
        private Double lat;     
        private Double lng;         
        private Float review;
        private Integer numReviews;
        private Boolean isRestaurant;
        private Boolean isLandmark;
        private Boolean isClub;
        private Boolean isBar;
        private String description;
        private Integer price;
        private String zone;

        public VenueInfo() {
        }

        // Constructor from Location entity
        public VenueInfo(Integer id, String name, String address, String uri, 
                    Double lat, Double lng, Float review,  
                    Integer numReviews, Boolean isRestaurant, Boolean isLandmark, 
                    Boolean isClub, Boolean isBar, String description, 
                    Integer price, String zone) {
            this.id = id;
            this.name = name;
            this.address = address;
            this.uri = uri;
            this.lat = lat;           
            this.lng = lng;           
            this.review = review;
            this.numReviews = numReviews;
            this.isRestaurant = isRestaurant;
            this.isLandmark = isLandmark;
            this.isClub = isClub;
            this.isBar = isBar;
            this.description = description;
            this.price = price;
            this.zone = zone;
        }

        // all Getters and Setters
        public Integer getId() { return id; }
        public void setId(Integer id) { this.id = id; }
        
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        
        public String getAddress() { return address; }
        public void setAddress(String address) { this.address = address; }
        
        public String getUri() { return uri; }
        public void setUri(String uri) { this.uri = uri; }
        
        public Double getLat() { return lat; }
        public void setLat(Double lat) { this.lat = lat; }
        
        public Double getLng() { return lng; }
        public void setLng(Double lng) { this.lng = lng; }
        
        public Float getReview() { return review; }
        public void setReview(Float review) { this.review = review; }
        
        public Integer getNumReviews() { return numReviews; }
        public void setNumReviews(Integer numReviews) { this.numReviews = numReviews; }
        
        public Boolean getIsRestaurant() { return isRestaurant; }
        public void setIsRestaurant(Boolean isRestaurant) { this.isRestaurant = isRestaurant; }
        
        public Boolean getIsLandmark() { return isLandmark; }
        public void setIsLandmark(Boolean isLandmark) { this.isLandmark = isLandmark; }
        
        public Boolean getIsClub() { return isClub; }
        public void setIsClub(Boolean isClub) { this.isClub = isClub; }
        
        public Boolean getIsBar() { return isBar; }
        public void setIsBar(Boolean isBar) { this.isBar = isBar; }
        
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        
        public Integer getPrice() { return price; }
        public void setPrice(Integer price) { this.price = price; }
        
        public String getZone() { return zone; }
        public void setZone(String zone) { this.zone = zone; }
    }
}