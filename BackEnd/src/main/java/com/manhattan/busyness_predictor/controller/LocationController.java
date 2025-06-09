package com.manhattan.busyness_predictor.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
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
@RequestMapping("/api/locations")
@CrossOrigin(origins = "http://localhost:4137") // Vite/React url
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

    // Click on location - fetch location information & busyness prediction
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getLocationDetails(@PathVariable Long id) {
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

    // Add to favourites - alter user profile with API
    @PostMapping("/{id}/favourite")
    public ResponseEntity<Map<String, String>> addToFavourites(
            @PathVariable Long id,
            @RequestParam Long userId) {

        try {
            favouriteService.addToFavourites(userId, id);

            Map<String, String> response = new HashMap<>();
            response.put("message", "Location added to favourites successfully");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    // Remove from favourites
    @DeleteMapping("/{id}/favourite")
    public ResponseEntity<Map<String, String>> removeFromFavourites(
            @PathVariable Long id,
            @RequestParam Long userId) {

        try {
            favouriteService.removeFromFavourites(userId, id);

            Map<String, String> response = new HashMap<>();
            response.put("message", "Location removed from favourites successfully");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    // Leave a review - Simple post request to update Locations DB
    @PostMapping("/{id}/reviews")
    public ResponseEntity<Map<String, Object>> leaveReview(
            @PathVariable Long id,
            @RequestParam Long userId,
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
    @PutMapping("/reviews/{reviewId}")
    public ResponseEntity<Map<String, Object>> updateReview(
            @PathVariable Long reviewId,
            @RequestParam Long userId,
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
            @PathVariable Long id,
            @RequestParam Long senderId,
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

    // Get user's favourite locations
    @GetMapping("/favourites")
    public ResponseEntity<List<Location>> getFavouriteLocations(@RequestParam Long userId) {
        try {
            List<Location> favourites = favouriteService.getFavouriteLocations(userId);
            return ResponseEntity.ok(favourites);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    // Get user's search history
    @GetMapping("/history")
    public ResponseEntity<List<Location>> getSearchHistory(@RequestParam Long userId) {
        try {
            List<Location> history = historyService.getSearchHistory(userId);
            return ResponseEntity.ok(history);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }
}