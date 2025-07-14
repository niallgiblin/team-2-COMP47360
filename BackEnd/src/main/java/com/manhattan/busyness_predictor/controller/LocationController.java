package com.manhattan.busyness_predictor.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.manhattan.busyness_predictor.dto.LocationDto;
import com.manhattan.busyness_predictor.dto.ReviewDto;
import com.manhattan.busyness_predictor.dto.ReviewRequest;
import com.manhattan.busyness_predictor.dto.ShareRequest;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.Review;
import com.manhattan.busyness_predictor.security.UserPrincipal;
import com.manhattan.busyness_predictor.service.HistoryService;
import com.manhattan.busyness_predictor.service.LocationService;
import com.manhattan.busyness_predictor.service.ReviewService;
import com.manhattan.busyness_predictor.service.SharedService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/locations")
public class LocationController {

    @Autowired
    private LocationService locationService;
    @Autowired
    private ReviewService reviewService;
    @Autowired
    private SharedService sharedService;
    @Autowired
    private HistoryService historyService;

    // Load Map - Fetch all/subset locations
    @GetMapping
    public ResponseEntity<List<LocationDto>> getAllLocations(
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

        List<LocationDto> locationDtos = locations.stream().map(LocationDto::fromLocation).collect(Collectors.toList());
        return ResponseEntity.ok(locationDtos);
    }

    @GetMapping("/")
    public ResponseEntity<String> home() {
        return ResponseEntity.ok("Busyness Predictor API - Access /api/location for endpoints");
    }
    
    // Click on location - fetch location information & busyness prediction
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getLocationDetails(@PathVariable Integer id) {
        LocationDto locationDto = LocationDto.fromLocation(locationService.getLocationById(id));
        // TODO: Add busyness data when API is ready
        Map<String, Object> response = new HashMap<>();
        response.put("location", locationDto);
        response.put("busyness", "Coming soon"); // Placeholder
        return ResponseEntity.ok(response);
    }

    // Find nearby locations by type
    @GetMapping("/nearby")
    public ResponseEntity<List<LocationDto>> getNearbyLocations(
            @RequestParam Double lat,
            @RequestParam Double lng,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "5") Double radius) {

        List<Location> locations = locationService.getNearbyLocationsByType(lat, lng, radius, type);
        List<LocationDto> locationDtos = locations.stream().map(LocationDto::fromLocation).collect(Collectors.toList());
        return ResponseEntity.ok(locationDtos);
    }

    // What's trending right now
    @GetMapping("/trending")
    public ResponseEntity<List<LocationDto>> getTrendingLocations() {
        // For now, return most reviewed locations
        List<Location> trending = locationService.getTrendingLocations();
        List<LocationDto> locationDtos = trending.stream().map(LocationDto::fromLocation).collect(Collectors.toList());
        return ResponseEntity.ok(locationDtos);
    }

    // Leave a review - Simple post request to update Locations DB
    @PostMapping("/{id}/review")
    public ResponseEntity<ReviewDto> leaveReview(
            @PathVariable Integer id,
            @Valid @RequestBody ReviewRequest reviewRequest,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        Review review = reviewService.createReview(currentUser.getId(), id, reviewRequest);
        ReviewDto reviewDto = new ReviewDto(review);
        return ResponseEntity.status(HttpStatus.CREATED).body(reviewDto);
    }

    // Update a review
    @PutMapping("/review/{reviewId}")
    public ResponseEntity<ReviewDto> updateReview(
            @PathVariable Integer reviewId,
            @Valid @RequestBody ReviewRequest reviewRequest,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        Review review = reviewService.updateReview(reviewId, currentUser.getId(), reviewRequest);
        ReviewDto reviewDto = new ReviewDto(review);
        return ResponseEntity.ok(reviewDto);
    }

    // Share with a friend - Request that updates a table "shared"
    @PostMapping("/{id}/share")
    public ResponseEntity<Void> shareLocation(
            @PathVariable Integer id,
            @Valid @RequestBody ShareRequest shareRequest,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        sharedService.shareLocation(currentUser.getId(), shareRequest.getReceiverId(), id);
        return ResponseEntity.ok().build();
    }

    // Get user's search history
    @GetMapping("/history")
    public ResponseEntity<List<LocationDto>> getSearchHistory(@AuthenticationPrincipal UserPrincipal currentUser) {
        List<LocationDto> history = historyService.getSearchHistory(currentUser.getId()).stream()
                .map(LocationDto::fromLocation).collect(Collectors.toList());
        return ResponseEntity.ok(history);
    }

    @GetMapping("/search")
    public ResponseEntity<Page<LocationDto>> searchLocations(
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

        Page<LocationDto> dtoPage = results.map(LocationDto::fromLocation);
        return ResponseEntity.ok(dtoPage);
    }
}