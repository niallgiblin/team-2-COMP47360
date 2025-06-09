package com.manhattan.busyness_predictor.service;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.repository.LocationRepository;

@Service
public class LocationService {

    @Autowired
    private LocationRepository locationRepository;

    public List<Location> getAllLocations() {
        return locationRepository.findAll();
    }

    public Location getLocationById(Long id) {
        return locationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Location not found"));
    }

    public List<Location> getLocationsByType(String type) {
        // Use the unified type query from repository
        return locationRepository.findByType(type.toLowerCase());
    }

    public List<Location> getLocationsNearby(Double lat, Double lng, Double radius) {
        // Using Haversine formula for distance calculation
        return locationRepository.findNearbyLocations(lat, lng, radius);
    }

    public List<Location> getNearbyLocationsByType(Double lat, Double lng, Double radius, String type) {
        if (type == null) {
            return getLocationsNearby(lat, lng, radius);
        }
        // Use the combined nearby + type query from repository
        return locationRepository.findNearbyLocationsByType(lat, lng, radius, type.toLowerCase());
    }

    public List<Location> getTrendingLocations() {
        // Return locations with most reviews in last 30 days
        LocalDateTime thirtyDaysAgo = LocalDateTime.now().minusDays(30);
        return locationRepository.findMostReviewedSince(thirtyDaysAgo);
    }
}