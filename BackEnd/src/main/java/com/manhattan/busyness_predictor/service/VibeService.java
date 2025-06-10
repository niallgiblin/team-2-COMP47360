package com.manhattan.busyness_predictor.service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.manhattan.busyness_predictor.dto.VibeSearchRequest;
import com.manhattan.busyness_predictor.dto.VibeSearchResponse;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.repository.LocationRepository;

@Service
public class VibeService {

    @Autowired
    private LocationRepository locationRepository;

    @Autowired
    private LLMService llmService;

    @Autowired
    private LocationService locationService;

    public VibeSearchResponse findLocationsByVibe(VibeSearchRequest request) {
        try {
            // Step 1: Call LLM to analyze the vibe and get recommendations
            String llmResponse = llmService.findLocationsByVibe(
                request.getVibeDescription(),
                request.getMaxResults(),
                request.getLocation(),
                request.getPriceRange(),
                request.getTimeOfDay()
            );

            // Step 2: Parse LLM response to extract location IDs and explanation
            LLMVibeResult llmResult = parseLLMResponse(llmResponse);

            // Step 3: If LLM returned location IDs, fetch from database
            List<Location> locations = new ArrayList<>();
            if (llmResult.getLocationIds() != null && !llmResult.getLocationIds().isEmpty()) {
                locations = getLocationsByIds(llmResult.getLocationIds());
            }

            // Step 4: If no specific IDs, fall back to keyword-based search
            if (locations.isEmpty()) {
                locations = performFallbackSearch(request);
            }

            // Step 5: Create response
            VibeSearchResponse response = new VibeSearchResponse();
            response.setLocations(locations);
            response.setExplanation(llmResult.getExplanation());
            response.setSearchQuery(request.getVibeDescription());
            response.setConfidence(llmResult.getConfidence());

            return response;

        } catch (Exception e) {
            throw new RuntimeException("Failed to find locations by vibe: " + e.getMessage());
        }
    }

    public List<Location> findSimilarLocations(Integer locationId, Integer limit) {
        try {
            // Step 1: Get the base location
            Location baseLocation = locationRepository.findById(locationId)
                .orElseThrow(() -> new RuntimeException("Location not found"));

            // Step 2: Generate vector for the base location
            String locationVector = llmService.generateLocationVector(baseLocation);

            // Step 3: Find similar locations using vector similarity
            List<Integer> similarLocationIds = llmService.findSimilarLocationsByVector(
                locationVector, limit, locationId
            );

            // Step 4: Fetch locations from database
            return getLocationsByIds(similarLocationIds);

        } catch (Exception e) {
            throw new RuntimeException("Failed to find similar locations: " + e.getMessage());
        }
    }

    public String generateLocationVibeProfile(Integer locationId) {
        try {
            Location location = locationRepository.findById(locationId)
                .orElseThrow(() -> new RuntimeException("Location not found"));

            return llmService.generateVibeProfile(location);

        } catch (Exception e) {
            throw new RuntimeException("Failed to generate vibe profile: " + e.getMessage());
        }
    }

    public Location getLocationById(Integer id) {
        return locationRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Location not found"));
    }

    public List<Location> getLocationsByIds(List<Integer> locationIds) {
        return locationRepository.findAllById(locationIds);
    }

    private LLMVibeResult parseLLMResponse(String llmResponse) {
        // Parse the LLM response to extract:
        // 1. Location IDs (if provided)
        // 2. Explanation text
        // 3. Confidence score
        
        // This would typically involve JSON parsing or regex
        // For now, implementing a simple parser
        
        LLMVibeResult result = new LLMVibeResult();
        
        try {
            // Assuming LLM returns JSON-like format:
            // {"locationIds": [1, 2, 3], "explanation": "...", "confidence": 0.85}
            
            if (llmResponse.contains("\"locationIds\"")) {
                // Extract location IDs using regex or JSON parser
                result.setLocationIds(extractLocationIds(llmResponse));
            }
            
            if (llmResponse.contains("\"explanation\"")) {
                result.setExplanation(extractExplanation(llmResponse));
            }
            
            if (llmResponse.contains("\"confidence\"")) {
                result.setConfidence(extractConfidence(llmResponse));
            }
            
        } catch (Exception e) {
            // If parsing fails, treat as plain text explanation
            result.setExplanation(llmResponse);
            result.setConfidence(0.5);
        }
        
        return result;
    }

    private List<Location> performFallbackSearch(VibeSearchRequest request) {
        // Fallback search using keywords from the vibe description
        String vibeDescription = request.getVibeDescription().toLowerCase();
        
        // Extract keywords and search in location names and descriptions
        List<Location> allLocations = locationRepository.findAll();
        
        return allLocations.stream()
            .filter(location -> matchesVibe(location, vibeDescription))
            .limit(request.getMaxResults())
            .collect(Collectors.toList());
    }

    private boolean matchesVibe(Location location, String vibeDescription) {
        String locationText = (location.getName() + " " + 
                             location.getDescription() + " " + 
                             location.getAddress()).toLowerCase();
        
        // Simple keyword matching - could be improved with more sophisticated NLP
        String[] keywords = vibeDescription.split("\\s+");
        
        for (String keyword : keywords) {
            if (locationText.contains(keyword)) {
                return true;
            }
        }
        
        return false;
    }

    // Helper methods for parsing LLM response
    private List<Integer> extractLocationIds(String response) {
        // Implementation for extracting location IDs from LLM response
        List<Integer> ids = new ArrayList<>();
        // Add parsing logic here
        return ids;
    }

    private String extractExplanation(String response) {
        // Implementation for extracting explanation from LLM response
        return "LLM explanation parsed from response";
    }

    private Double extractConfidence(String response) {
        // Implementation for extracting confidence score
        return 0.8;
    }

    // Inner class for LLM result parsing
    private static class LLMVibeResult {
        private List<Integer> locationIds;
        private String explanation;
        private Double confidence;

        // Getters and setters
        public List<Integer> getLocationIds() { return locationIds; }
        public void setLocationIds(List<Integer> locationIds) { this.locationIds = locationIds; }
        
        public String getExplanation() { return explanation; }
        public void setExplanation(String explanation) { this.explanation = explanation; }
        
        public Double getConfidence() { return confidence; }
        public void setConfidence(Double confidence) { this.confidence = confidence; }
    }
}