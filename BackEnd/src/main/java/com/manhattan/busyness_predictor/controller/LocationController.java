package com.manhattan.busyness_predictor.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.manhattan.busyness_predictor.dto.ReviewRequest;
import com.manhattan.busyness_predictor.dto.ShareRequest;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.Review;
import com.manhattan.busyness_predictor.service.FavouriteService;
import com.manhattan.busyness_predictor.service.HistoryService;
import com.manhattan.busyness_predictor.service.LocationService;
import com.manhattan.busyness_predictor.service.ReviewService;
import com.manhattan.busyness_predictor.service.SharedService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/location")
public class LocationController {

    @Autowired
    private LocationService locationService;
    @Autowired
    private FavouriteService favouriteService;
    @Autowired
    private ReviewService reviewService;
    @Autowired
    private SharedService sharedService;
    @Autowired
    private HistoryService historyService;

    // Load Map - Fetch all/subset locations
    @GetMapping
    public ResponseEntity<List<Location>> getAllLocations(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng,
            @RequestParam(required = false, defaultValue = "10") Double radius) {

        List<Location> locations;

        if (type != null) {
            // Filter by type (restaurant, bar, club etc)
            locations = locationService.getLocationsByType(type);
        } else if (lat != null && lng != null) {
            // Get locations within radius
            locations = locationService.getLocationsNearby(lat, lng, radius);
        } else {
            // Get all locations
            locations = locationService.getAllLocations();
        }

        return ResponseEntity.ok(locations);
    }

    @GetMapping("/")
    public ResponseEntity<String> home() {
        return ResponseEntity.ok("Busyness Predictor API - Access /api/location for endpoints");
    }
    
    // Click on location - fetch location information & busyness prediction
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getLocationDetails(@PathVariable Integer id) {
        try {
            Location location = locationService.getLocationById(id);

            // TODO: Add busyness data when API is ready
            Map<String, Object> response = new HashMap<>();
            response.put("location", location);
            response.put("busyness", "Coming soon"); // Placeholder

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    // Find nearby locations by type
    @GetMapping("/nearby")
    public ResponseEntity<List<Location>> getNearbyLocations(
            @RequestParam Double lat,
            @RequestParam Double lng,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "5") Double radius) {

        List<Location> locations = locationService.getNearbyLocationsByType(lat, lng, radius, type);
        return ResponseEntity.ok(locations);
    }

    // What's trending right now
    @GetMapping("/trending")
    public ResponseEntity<List<Location>> getTrendingLocations() {
        // For now, return most reviewed locations
        List<Location> trending = locationService.getTrendingLocations();
        return ResponseEntity.ok(trending);
    }

    // Leave a review - Simple post request to update Locations DB
    @PostMapping("/{id}/review")
    public ResponseEntity<Map<String, Object>> leaveReview(
            @PathVariable Integer id,
            @RequestParam Integer userId,
            @Valid @RequestBody ReviewRequest reviewRequest) {

        try {
            Review review = reviewService.createReview(userId, id, reviewRequest);

            Map<String, Object> response = new HashMap<>();
            response.put("message", "Review created successfully");
            response.put("review", review);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    // Update a review
    @PutMapping("/review/{id}")
    public ResponseEntity<Map<String, Object>> updateReview(
            @PathVariable Integer reviewId,
            @RequestParam Integer userId,
            @Valid @RequestBody ReviewRequest reviewRequest) {

        try {
            Review review = reviewService.updateReview(reviewId, userId, reviewRequest);

            Map<String, Object> response = new HashMap<>();
            response.put("message", "Review updated successfully");
            response.put("review", review);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    // Share with a friend - Request that updates a table "shared"
    @PostMapping("/{id}/share")
    public ResponseEntity<Map<String, String>> shareLocation(
            @PathVariable Integer id,
            @RequestParam Integer senderId,
            @Valid @RequestBody ShareRequest shareRequest) {

        try {
            sharedService.shareLocation(senderId, shareRequest.getReceiverId(), id);

            Map<String, String> response = new HashMap<>();
            response.put("message", "Location shared successfully");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    // Get user's search history
    @GetMapping("/history")
    public ResponseEntity<?> getSearchHistory(@RequestParam Integer userId) {
        try {
            List<Location> history = historyService.getSearchHistory(userId);
            return ResponseEntity.ok(history);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "Failed to retrieve search history.");
            error.put("message", e.getMessage());
            return ResponseEntity.internalServerError().body(error);
        }
    }

    @GetMapping("/search")
    public ResponseEntity<Page<Location>> searchLocations(
            @RequestParam(required = false) String input,
            @RequestParam(required = false) Boolean isRestaurant,
            @RequestParam(required = false) Boolean isLandmark,
            @RequestParam(required = false) Boolean isClub,
            @RequestParam(required = false) Boolean isBar,
            @RequestParam(required = false) Integer maxPrice,
            @RequestParam(required = false) String information,
            @RequestParam(required = false) String summary,
            @RequestParam(required = false) String tags,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "name") String sort,
            @RequestParam(defaultValue = "asc") String direction) {

        Sort.Direction sortDirection = "desc".equalsIgnoreCase(direction)
                ? Sort.Direction.DESC
                : Sort.Direction.ASC;

        Pageable pageable = PageRequest.of(
                page,
                size,
                Sort.by(sortDirection, sort));
        
        Page<Location> results = locationService.searchLocations(
                input, isRestaurant, isLandmark, isClub, isBar, maxPrice,
                information, summary, tags,
                pageable);

        return ResponseEntity.ok(results);
    }
}