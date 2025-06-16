package com.manhattan.busyness_predictor.service;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.repository.LocationRepository;

import jakarta.persistence.criteria.Predicate;

@Service
public class LocationService {

    @Autowired
    private LocationRepository locationRepository;

    public List<Location> getAllLocations() {
        return locationRepository.findAll();
    }

    public Location getLocationById(Integer id) {
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

    public Page<Location> searchLocations(String input, Boolean isRestaurant,
            Boolean isLandmark, Boolean isClub,
            Boolean isBar, Integer maxPrice,
            Pageable pageable) {

        return locationRepository.findAll((root, query, cb) -> {
            Predicate predicate = cb.conjunction();

            // Text search across name, address, and description
            if (input != null && !input.isEmpty()) {
                String[] terms = input.toLowerCase().split("\\s+");
                Predicate[] textPredicates = new Predicate[terms.length * 3];
                for (int i = 0; i < terms.length; i++) {
                    String term = terms[i];
                    textPredicates[i * 3] = cb.like(cb.lower(root.get("name")), "%" + term + "%");
                    textPredicates[i * 3 + 1] = cb.like(cb.lower(root.get("address")), "%" + term + "%");
                    textPredicates[i * 3 + 2] = cb.like(cb.lower(root.get("description")), "%" + term + "%");
                }
                predicate = cb.and(predicate, cb.or(textPredicates));
            }

            // Venue type filters
            if (isRestaurant != null) {
                predicate = cb.and(predicate, cb.equal(root.get("isRestaurant"), isRestaurant));
            }
            if (isLandmark != null) {
                predicate = cb.and(predicate, cb.equal(root.get("isLandmark"), isLandmark));
            }
            if (isClub != null) {
                predicate = cb.and(predicate, cb.equal(root.get("isClub"), isClub));
            }
            if (isBar != null) {
                predicate = cb.and(predicate, cb.equal(root.get("isBar"), isBar));
            }

            // Price filter
            if (maxPrice != null) {
                predicate = cb.and(predicate, cb.lessThanOrEqualTo(root.get("price"), maxPrice));
            }

            return predicate;
        }, pageable);
    }
}