package com.manhattan.busyness_predictor.dto;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import com.manhattan.busyness_predictor.model.Location;

public class LocationDto {
    private Integer id;
    private String name;
    private String type;
    private double lat;
    private double lng;
    private String address;
    private String uri;
    private Float review;
    private Integer numReviews;
    private Integer price;
    private Boolean isRestaurant;
    private Boolean isBar;
    private Boolean isClub;
    private Boolean isLandmark;
    private String description;
    private String information;
    private String summary;
    private List<String> tags;
    private String zone;

    public LocationDto(Location location) {
        this.id = location.getId();
        this.name = location.getName();
        this.type = location.getType();
        this.lat = location.getLat() != null ? location.getLat() : 0.0;
        this.lng = location.getLng() != null ? location.getLng() : 0.0;
        this.address = location.getAddress();
        this.uri = location.getUri();
        this.review = location.getReview();
        this.numReviews = location.getNumReviews();
        this.price = location.getPrice();
        this.isRestaurant = location.getIsRestaurant();
        this.isBar = location.getIsBar();
        this.isClub = location.getIsClub();
        this.isLandmark = location.getIsLandmark();
        this.description = location.getDescription();
        this.information = location.getInformation();
        this.summary = location.getSummary();
        
        String tagsString = location.getTags();
        if (tagsString != null && !tagsString.trim().isEmpty()) {
            this.tags = Arrays.asList(tagsString.split(",\\s*"));
        } else {
            this.tags = new ArrayList<>();
        }
        this.zone = location.getZone();
    }

    public static LocationDto fromLocation(Location location) {
        return new LocationDto(location);
    }

    // Getters and Setters
    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public double getLat() { return lat; }
    public void setLat(double lat) { this.lat = lat; }

    public double getLng() { return lng; }
    public void setLng(double lng) { this.lng = lng; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getUri() { return uri; }
    public void setUri(String uri) { this.uri = uri; }

    public Float getReview() { return review; }
    public void setReview(Float review) { this.review = review; }

    public Integer getNumReviews() { return numReviews; }
    public void setNumReviews(Integer numReviews) { this.numReviews = numReviews; }

    public Integer getPrice() { return price; }
    public void setPrice(Integer price) { this.price = price; }

    public Boolean getIsRestaurant() { return isRestaurant; }
    public void setIsRestaurant(Boolean isRestaurant) { this.isRestaurant = isRestaurant; }

    public Boolean getIsBar() { return isBar; }
    public void setIsBar(Boolean isBar) { this.isBar = isBar; }

    public Boolean getIsClub() { return isClub; }
    public void setIsClub(Boolean isClub) { this.isClub = isClub; }

    public Boolean getIsLandmark() { return isLandmark; }
    public void setIsLandmark(Boolean isLandmark) { this.isLandmark = isLandmark; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getInformation() { return information; }
    public void setInformation(String information) { this.information = information; }

    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }

    public List<String> getTags() { return tags; }
    public void setTags(List<String> tags) { this.tags = tags; }

    public String getZone() { return zone; }
    public void setZone(String zone) { this.zone = zone; }
}