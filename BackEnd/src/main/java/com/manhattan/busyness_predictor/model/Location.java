package com.manhattan.busyness_predictor.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

@Entity
@Table(name = "location")
public class Location {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Column(name = "latitude")
    private Double lat;

    @Column(name = "longitude")
    private Double lng;

    @Column(name = "name")
    private String name;

    @Column(name = "address")
    private String address;

    @Column(name = "uri")
    private String uri;

    @Column(name = "review")
    private Float review;

    @Column(name = "num_reviews")
    private Integer numReviews;

    @Column(name = "is_restaurant")
    private Boolean isRestaurant;

    @Column(name = "is_landmark")
    private Boolean isLandmark;

    @Column(name = "is_club")
    private Boolean isClub;

    @Column(name = "is_bar")
    private Boolean isBar;

    @Column(name = "description")
    private String description;

    @Column(name = "price")
    private Integer price;

    @Column(name = "zone")
    private String zone;

    @Transient // This field is not persisted in the database
    private Double similarity;

    // Constructors
    public Location() {
    }

    public Location(Double lat, Double lng, String name, String address, String uri,
            Float review, Integer numReviews, Boolean isRestaurant, Boolean isLandmark,
            Boolean isClub, Boolean isBar, String description, Integer price, String zone) {
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
        this.zone = zone;
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

    public String getZone() {
        return zone;
    }

    public void setZone(String zone) {
        this.zone = zone;
    }

    public Double getSimilarity() {
        return similarity;
    }

    public void setSimilarity(Double similarity) {
        this.similarity = similarity;
    }
}