package com.manhattan.busyness_predictor.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.manhattan.busyness_predictor.dto.SimilarLocationsResult;
import com.manhattan.busyness_predictor.dto.VibeSearchRequest;
import com.manhattan.busyness_predictor.dto.VibeSearchResponse;
import com.manhattan.busyness_predictor.service.VibeService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/vibe")
public class VibeController {

    private final VibeService vibeService;

    public VibeController(VibeService vibeService) {
        this.vibeService = vibeService;
    }
    // Find My Vibe - Search by natural language description

    @PostMapping("/search")
    public ResponseEntity<Map<String, Object>> findBySearch(
            @Valid @RequestBody VibeSearchRequest request) {
        VibeSearchResponse response = vibeService.findLocationsByVibe(request);

        Map<String, Object> result = new HashMap<>();
        result.put("message", "Vibe search completed successfully");
        result.put("query", request.getVibeDescription());
        result.put("locations", response.getLocations());
        result.put("llmExplanation", response.getExplanation());
        result.put("busyness", response.getBusyness());
        result.put("totalResults", response.getLocations().size());

        return ResponseEntity.ok(result);
    }

    @GetMapping("/trending")
    public ResponseEntity<Map<String, Object>> getTrendingWithBusyness() {
        VibeSearchResponse response = vibeService.getTrendingWithBusyness();

        Map<String, Object> result = new HashMap<>();
        result.put("message", "Trending locations fetched successfully");
        result.put("locations", response.getLocations());
        result.put("llmExplanation", response.getExplanation());
        result.put("busyness", response.getBusyness());
        result.put("totalResults", response.getLocations().size());

        return ResponseEntity.ok(result);
    }

    @GetMapping("/map-data")
    public ResponseEntity<Map<String, Object>> getMapData() {
        VibeSearchResponse response = vibeService.getMapData();

        Map<String, Object> result = new HashMap<>();
        result.put("message", "Map data fetched successfully");
        result.put("locations", response.getLocations());
        result.put("busyness", response.getBusyness());
        result.put("predictions", response.getPredictions());
        result.put("totalResults", response.getLocations().size());

        return ResponseEntity.ok(result);
    }

    // Find Similar Locations - Based on location vector similarity
    @PostMapping("/similar")
    public ResponseEntity<Map<String, Object>> findSimilarLocations(
            @RequestParam Integer locationId,
            @RequestParam(defaultValue = "5") Integer limit) {
        if (limit < 1 || limit > 25) {
            throw new IllegalArgumentException("limit must be between 1 and 25");
        }
        SimilarLocationsResult result = vibeService.findSimilarLocations(locationId, limit);

        Map<String, Object> response = new HashMap<>();
        response.put("message", "Similar locations found successfully");
        response.put("baseLocationId", locationId);
        response.put("similarLocations", result.getLocations());
        response.put("source", result.getSource());
        response.put("totalResults", result.getLocations().size());

        return ResponseEntity.ok(response);
    }
}
