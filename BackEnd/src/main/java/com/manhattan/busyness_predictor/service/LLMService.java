package com.manhattan.busyness_predictor.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.manhattan.busyness_predictor.model.Location;

@Service
public class LLMService {

    // This would integrate with your chosen LLM (OpenAI, Anthropic, etc.)
    
    public String findLocationsByVibe(String vibeDescription, Integer maxResults, 
                                    String location, String priceRange, String timeOfDay) {
        
        // Construct prompt for LLM
        String prompt = buildVibeSearchPrompt(vibeDescription, maxResults, location, priceRange, timeOfDay);
        
        // Call LLM API (placeholder - replace with actual LLM integration)
        return callLLMAPI(prompt);
    }

    public String generateLocationVector(Location location) {
        // Generate vector representation of a location for similarity search
        String prompt = buildVectorGenerationPrompt(location);
        return callLLMAPI(prompt);
    }

    public List<Integer> findSimilarLocationsByVector(String locationVector, Integer limit, Integer excludeId) {
        // Find similar locations based on vector similarity
        String prompt = buildSimilaritySearchPrompt(locationVector, limit, excludeId);
        String response = callLLMAPI(prompt);
        
        // Parse response to extract location IDs
        return parseLocationIdsFromResponse(response);
    }

    public String generateVibeProfile(Location location) {
        // Generate a detailed vibe profile for a location
        String prompt = buildVibeProfilePrompt(location);
        return callLLMAPI(prompt);
    }

    private String buildVibeSearchPrompt(String vibeDescription, Integer maxResults, 
                                       String location, String priceRange, String timeOfDay) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("Find Manhattan locations that match this vibe: '").append(vibeDescription).append("'\n\n");
        prompt.append("Consider the following preferences:\n");
        
        if (location != null) {
            prompt.append("- Area: ").append(location).append("\n");
        }
        if (priceRange != null) {
            prompt.append("- Price range: ").append(priceRange).append("\n");
        }
        if (timeOfDay != null) {
            prompt.append("- Time of day: ").append(timeOfDay).append("\n");
        }
        
        prompt.append("\nReturn up to ").append(maxResults).append(" locations with:\n");
        prompt.append("1. Location IDs (if you have access to our database)\n");
        prompt.append("2. Explanation of why these locations match the vibe\n");
        prompt.append("3. Confidence score (0-1)\n");
        prompt.append("\nFormat as JSON: {\"locationIds\": [1,2,3], \"explanation\": \"...\", \"confidence\": 0.85}");
        
        return prompt.toString();
    }

    private String buildVectorGenerationPrompt(Location location) {
        return String.format("""
                             Generate a vector representation for this location:
                             Name: %s
                             Description: %s
                             Category: %s
                             Address: %s
                             Price Level: %d
                             Rating: %.1f
                             
                             Create a semantic vector that captures the vibe, atmosphere, and characteristics of this location.""",
            location.getName(),
            location.getDescription(),
            getLocationCategory(location),
            location.getAddress(),
            location.getPrice(),
            location.getReview()
        );
    }

    private String buildSimilaritySearchPrompt(String locationVector, Integer limit, Integer excludeId) {
        return String.format("""
                             Given this location vector: %s
                             
                             Find %d similar locations in Manhattan that would appeal to someone who likes this type of place.
                             Exclude location ID: %d
                             Return location IDs as a JSON array: [1, 2, 3, ...]""",
            locationVector, limit, excludeId
        );
    }

    private String buildVibeProfilePrompt(Location location) {
        return String.format("""
                             Create a detailed vibe profile for this Manhattan location:
                             Name: %s
                             Description: %s
                             Category: %s
                             Rating: %.1f (%d reviews)
                             
                             Describe the atmosphere, crowd, energy level, best times to visit, and what type of person would enjoy this place.""",
            location.getName(),
            location.getDescription(),
            getLocationCategory(location),
            location.getReview(),
            location.getNumReviews()
        );
    }

    private String callLLMAPI(String prompt) {
        // Placeholder for actual LLM API call
        // This would integrate with OpenAI, Anthropic Claude, or other LLM services
        
        // For now, return a mock response
        return "{\"locationIds\": [1, 2, 3], \"explanation\": \"These locations match your vibe because they offer a vibrant atmosphere with great ambiance.\", \"confidence\": 0.85}";
    }

    private List<Integer> parseLocationIdsFromResponse(String response) {
        // Parse location IDs from LLM response
        // Implementation would depend on response format
        return List.of(1, 2, 3); // Placeholder
    }

    private String getLocationCategory(Location location) {
        if (location.getIsRestaurant()) return "Restaurant";
        if (location.getIsBar()) return "Bar";
        if (location.getIsClub()) return "Club";
        if (location.getIsLandmark()) return "Landmark";
        return "Other";
    }
}