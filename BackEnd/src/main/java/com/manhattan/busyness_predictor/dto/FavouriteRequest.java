package com.manhattan.busyness_predictor.dto;

import jakarta.validation.constraints.NotNull;

public class FavouriteRequest {
    @NotNull
    private Integer venueId;

    public Integer getVenueId() {
        return venueId;
    }

    public void setVenueId(Integer venueId) {
        this.venueId = venueId;
    }
}