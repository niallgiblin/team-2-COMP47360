package com.manhattan.busyness_predictor.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.manhattan.busyness_predictor.dto.VibeSearchRequest;
import com.manhattan.busyness_predictor.dto.VibeSearchResponse;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.service.VibeService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/vibe")
public class VibeController {

    private static final Logger logger = LoggerFactory.getLogger(VibeController.class);
    private final VibeService vibeService;

    public VibeController(VibeService vibeService) {
        this.vibeService = vibeService;
    }
    // Find My Vibe - Search by natural language description

    @PostMapping("/search")
    public ResponseEntity<Map<String, Object>> findBySearch(
            @Valid @RequestBody VibeSearchRequest request) {
        try {
            VibeSearchResponse response = vibeService.findLocationsByVibe(request);

            Map<String, Object> result = new HashMap<>();
            result.put("message", "Vibe search completed successfully");
            result.put("query", request.getVibeDescription());
            result.put("locations", response.getLocations());
            result.put("llmExplanation", response.getExplanation());
            result.put("totalResults", response.getLocations().size());

            return ResponseEntity.ok(result);
        } catch (Exception e) {
            logger.error("Error during vibe search for query: {}", request.getVibeDescription(), e);
            Map<String, Object> error = new HashMap<>();
            error.put("error", "An internal server error occurred during the search.");
            error.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    // Find Similar Locations - Based on location vector similarity
    @PostMapping("/similar")
    public ResponseEntity<Map<String, Object>> findSimilarLocations(
            @RequestParam Integer locationId,
            @RequestParam(defaultValue = "5") Integer limit) {
        try {
            List<Location> similarLocations = vibeService.findSimilarLocations(locationId, limit);

            Map<String, Object> response = new HashMap<>();
            response.put("message", "Similar locations found successfully");
            response.put("baseLocationId", locationId);
            response.put("similarLocations", similarLocations);
            response.put("totalResults", similarLocations.size());

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Error finding similar locations for ID: {}", locationId, e);
            Map<String, Object> error = new HashMap<>();
            error.put("error", "An internal server error occurred while finding similar locations.");
            if (e instanceof NoSuchElementException) {
                error.put("message", "Base location not found.");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
            }
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    // Get location details by ID (for LLM fallback)
    @GetMapping("/api/location/{id}")
    public ResponseEntity<Map<String, Object>> getLocationById(@PathVariable Integer id) {
        try {
            Location location = vibeService.getLocationById(id);

            Map<String, Object> response = new HashMap<>();
            response.put("location", location);

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Error fetching location by ID: {}", id, e);
            Map<String, Object> error = new HashMap<>();
            error.put("error", "Location not found.");
            error.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
        }
    }

    // Get multiple locations by IDs (for batch LLM responses)
    @PostMapping("/api/location/batch")
    public ResponseEntity<Map<String, Object>> getLocationsByIds(
            @RequestBody List<Integer> locationIds) {
        try {
            List<Location> locations = vibeService.getLocationsByIds(locationIds);

            Map<String, Object> response = new HashMap<>();
            response.put("locations", locations);
            response.put("totalResults", locations.size());

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Error during batch location fetch for IDs: {}", locationIds, e);
            Map<String, Object> error = new HashMap<>();
            error.put("error", "An internal server error occurred during batch fetch.");
            error.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
}
