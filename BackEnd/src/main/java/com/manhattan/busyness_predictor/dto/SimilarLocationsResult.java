package com.manhattan.busyness_predictor.dto;

import java.util.List;

public class SimilarLocationsResult {

    private final List<LocationDto> locations;
    private final String source;

    public SimilarLocationsResult(List<LocationDto> locations, String source) {
        this.locations = locations;
        this.source = source;
    }

    public List<LocationDto> getLocations() {
        return locations;
    }

    public String getSource() {
        return source;
    }
}
