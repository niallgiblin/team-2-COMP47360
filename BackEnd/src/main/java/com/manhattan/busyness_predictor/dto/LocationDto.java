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
    private String information;
    private String summary;
    private List<String> tags;

    public LocationDto(Location location) {
        this.id = location.getId();
        this.name = location.getName();
        this.type = location.getType();
        this.lat = location.getLat();
        this.lng = location.getLng();
        this.address = location.getAddress();
        this.information = location.getInformation();
        this.summary = location.getSummary();
        
        String tagsString = location.getTags();
        if (tagsString != null && !tagsString.trim().isEmpty()) {
            this.tags = Arrays.asList(tagsString.split(",\\s*"));
        } else {
            this.tags = new ArrayList<>();
        }
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

    public String getInformation() { return information; }
    public void setInformation(String information) { this.information = information; }

    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }

    public List<String> getTags() { return tags; }
    public void setTags(List<String> tags) { this.tags = tags; }
}