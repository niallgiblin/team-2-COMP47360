package com.manhattan.busyness_predictor.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.repository.LocationRepository;

import jakarta.persistence.criteria.Predicate;

@Service
public class LocationService {

    private static final Logger logger = LoggerFactory.getLogger(LocationService.class);

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
        List<Location> trending = locationRepository.findMostReviewedSince(thirtyDaysAgo).stream().limit(5).collect(Collectors.toList());

        // If no locations with recent reviews, fallback to all-time most reviewed.
        if (trending.isEmpty()) {
            logger.warn("No trending locations found with reviews in the last 30 days. Falling back to top 5 all-time most reviewed.");
            Pageable topFive = PageRequest.of(0, 5, Sort.by(Sort.Direction.DESC, "numReviews"));
            return locationRepository.findAll(topFive).getContent();
        }
        return trending;
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
                Predicate[] termPredicates = new Predicate[terms.length];
                for (int i = 0; i < terms.length; i++) {
                    String term = "%" + terms[i] + "%";
                    // For each term, find if it's in the name, address, OR description
                    Predicate nameMatch = cb.like(cb.lower(root.get("name")), term);
                    Predicate addressMatch = cb.like(cb.lower(root.get("address")), term);
                    Predicate descriptionMatch = cb.like(cb.lower(root.get("description")), term);
                    termPredicates[i] = cb.or(nameMatch, addressMatch, descriptionMatch);
                }
                // All terms must be found
                predicate = cb.and(predicate, cb.and(termPredicates));
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