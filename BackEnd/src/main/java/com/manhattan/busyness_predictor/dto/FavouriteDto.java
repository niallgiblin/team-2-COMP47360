package com.manhattan.busyness_predictor.dto;

import java.time.LocalDateTime;

import com.manhattan.busyness_predictor.model.Favourite;

public class FavouriteDto {
    private Integer id;
    private LocationDto location;
    private LocalDateTime likedAt;

    public FavouriteDto(Favourite favourite) {
        this.id = favourite.getId();
        this.location = LocationDto.fromLocation(favourite.getLocation());
        this.likedAt = favourite.getLikedAt();
    }

    public static FavouriteDto fromFavourite(Favourite favourite) {
        return new FavouriteDto(favourite);
    }

    // Getters and Setters
    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }

    public LocationDto getLocation() { return location; }
    public void setLocation(LocationDto location) { this.location = location; }

    public LocalDateTime getLikedAt() { return likedAt; }
    public void setLikedAt(LocalDateTime likedAt) { this.likedAt = likedAt; }
}