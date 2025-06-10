package com.manhattan.busyness_predictor.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "Location")
public class Location {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "Id")
    private Integer id;

    @Column(name = "Lat")
    private Double lat;

    @Column(name = "Long")
    private Double lng;

    @Column(name = "Name")
    private String name;

    @Column(name = "Address")
    private String address;

    @Column(name = "URI")
    private String uri;

    @Column(name = "Review")
    private Float review;

    @Column(name = "NumReviews")
    private Integer numReviews;

    @Column(name = "isRestaurant")
    private Boolean isRestaurant;

    @Column(name = "isLandmark")
    private Boolean isLandmark;

    @Column(name = "isClub")
    private Boolean isClub;

    @Column(name = "isBar")
    private Boolean isBar;

    @Column(name = "description")
    private String description;

    @Column(name = "Price")
    private Integer price;

    // Constructors
    public Location() {
    }

    public Location(Double lat, Double lng, String name, String address, String uri,
            Float review, Integer numReviews, Boolean isRestaurant, Boolean isLandmark,
            Boolean isClub, Boolean isBar, String description, Integer price) {
        this.lat = lat;
        this.lng = lng;
        this.name = name;
        this.address = address;
        this.uri = uri;
        this.review = review;
        this.numReviews = numReviews;
        this.isRestaurant = isRestaurant;
        this.isLandmark = isLandmark;
        this.isClub = isClub;
        this.isBar = isBar;
        this.description = description;
        this.price = price;
    }

    // Getters and Setters
    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public Double getLat() {
        return lat;
    }

    public void setLat(Double lat) {
        this.lat = lat;
    }

    public Double getLng() {
        return lng;
    }

    public void setLng(Double lng) {
        this.lng = lng;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getUri() {
        return uri;
    }

    public void setUri(String uri) {
        this.uri = uri;
    }

    public Float getReview() {
        return review;
    }

    public void setReview(Float review) {
        this.review = review;
    }

    public Integer getNumReviews() {
        return numReviews;
    }

    public void setNumReviews(Integer numReviews) {
        this.numReviews = numReviews;
    }

    public Boolean getIsRestaurant() {
        return isRestaurant;
    }

    public void setIsRestaurant(Boolean isRestaurant) {
        this.isRestaurant = isRestaurant;
    }

    public Boolean getIsLandmark() {
        return isLandmark;
    }

    public void setIsLandmark(Boolean isLandmark) {
        this.isLandmark = isLandmark;
    }

    public Boolean getIsClub() {
        return isClub;
    }

    public void setIsClub(Boolean isClub) {
        this.isClub = isClub;
    }

    public Boolean getIsBar() {
        return isBar;
    }

    public void setIsBar(Boolean isBar) {
        this.isBar = isBar;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Integer getPrice() {
        return price;
    }

    public void setPrice(Integer price) {
        this.price = price;
    }
}