package com.manhattan.busyness_predictor.service;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.manhattan.busyness_predictor.dto.LLMRecommendationResponse;
import com.manhattan.busyness_predictor.model.Location;

@Service
public class LLMService {

    private static final Logger logger = LoggerFactory.getLogger(LLMService.class);

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${LLM_API_URL}") // From docker-compose.yml
    private String llmApiUrl;

    @Value("${LLM_API_KEY}") // LLM API Key from .env
    private String llmApiKey;

    public LLMService(RestTemplateBuilder restTemplateBuilder) {
        this.restTemplate = restTemplateBuilder.build();
        this.objectMapper = new ObjectMapper();
    }

    public LLMRecommendationResponse findLocationsByVibe(String vibeDescription, Integer maxResults,
            String location, String priceRange, String timeOfDay) {
        String prompt = buildVibeSearchPrompt(vibeDescription, maxResults, location, priceRange, timeOfDay);
        return callLLMAPI(prompt, LLMRecommendationResponse.class);
    }

    public String generateLocationVector(Location location) { // This method's return type might need adjustment based
                                                              // on actual LLM output
        String prompt = buildVectorGenerationPrompt(location);
        return callLLMAPI(prompt, String.class); // Assuming it returns a string representation of the vector
    }

    public List<Integer> findSimilarLocationsByVector(String locationVector, Integer limit, Integer excludeId) {
        String prompt = buildSimilaritySearchPrompt(locationVector, limit, excludeId);
        // For simplicity, let's assume it returns a JSON object with a "locationIds"
        // field, similar to findLocationsByVibe
        LLMRecommendationResponse response = callLLMAPI(prompt, LLMRecommendationResponse.class);
        return response != null ? response.getLocationIds() : Collections.emptyList();
    }

    public String generateVibeProfile(Location location) {
        String prompt = buildVibeProfilePrompt(location);
        return callLLMAPI(prompt, String.class); // Assuming it returns a string profile
    }

    private String buildVibeSearchPrompt(String vibeDescription, Integer maxResults,
            String location, String priceRange, String timeOfDay) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("Find Manhattan locations that match this vibe: '").append(vibeDescription).append("'\n\n");
        prompt.append("Consider the following preferences:\n");

        if (location != null && !location.trim().isEmpty()) {
            prompt.append("- Area: ").append(location).append("\n");
        }
        if (priceRange != null && !priceRange.trim().isEmpty()) {
            prompt.append("- Price range: ").append(priceRange).append("\n");
        }
        if (timeOfDay != null && !timeOfDay.trim().isEmpty()) {
            prompt.append("- Time of day: ").append(timeOfDay).append("\n");
        }

        prompt.append("\nReturn up to ").append(maxResults).append(" locations with:\n");
        prompt.append("1. Location IDs (if you have access to our database)\n");
        prompt.append("2. Explanation of why these locations match the vibe (as a string)\n");
        prompt.append("3. Confidence score (0-1)\n");
        prompt.append("\nFormat as JSON: {\"locationIds\": [1,2,3], \"explanation\": \"...\", \"confidence\": 0.85}");

        return prompt.toString();
    }

    private String buildVectorGenerationPrompt(Location location) {
        if (location == null) {
            return "Generate a vector representation for an unknown location.";
        }
        return String.format("""
                Generate a vector representation for this location:
                Name: %s
                Description: %s
                Category: %s
                Address: %s
                Price Level: %s
                Rating: %.1f

                Create a semantic vector that captures the vibe, atmosphere, and characteristics of this location.""",
                location.getName() != null ? location.getName() : "N/A",
                location.getDescription() != null ? location.getDescription() : "N/A",
                getLocationCategory(location),
                location.getAddress() != null ? location.getAddress() : "N/A",
                location.getPrice() != null ? location.getPrice().toString() : "N/A", // Handle null price
                location.getReview() != null ? location.getReview() : 0.0f);
    }

    private String buildSimilaritySearchPrompt(String locationVector, Integer limit, Integer excludeId) {
        return String.format("""
                Given this location vector: %s

                Find %d similar locations in Manhattan that would appeal to someone who likes this type of place.
                Exclude location ID: %d
                Return location IDs as a JSON array: [1, 2, 3, ...]""",
                locationVector != null ? locationVector : "N/A",
                limit != null ? limit : 10,
                excludeId != null ? excludeId : -1);
    }

    private String buildVibeProfilePrompt(Location location) {
        if (location == null) {
            return "Create a detailed vibe profile for an unknown location.";
        }
        return String.format(
                """
                        Create a detailed vibe profile for this Manhattan location:
                        Name: %s
                        Description: %s
                        Category: %s
                        Rating: %.1f (%d reviews)

                        Describe the atmosphere, crowd, energy level, best times to visit, and what type of person would enjoy this place.""",
                location.getName() != null ? location.getName() : "N/A",
                location.getDescription() != null ? location.getDescription() : "N/A",
                getLocationCategory(location),
                location.getReview() != null ? location.getReview() : 0.0f,
                location.getNumReviews() != null ? location.getNumReviews() : 0);
    }

    private <T> T callLLMAPI(String prompt, Class<T> responseType) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            if (llmApiKey != null && !llmApiKey.trim().isEmpty()) {
                headers.setBearerAuth(llmApiKey); // Use Bearer token for API Key
            }

            // This request body is structured for the OpenAI Chat Completions API.
            // It specifies the model, the user's prompt, and requests a JSON response.
            Map<String, Object> message = Map.of("role", "user", "content", prompt);
            Map<String, Object> requestBody = Map.of(
                "model", "gpt-3.5-turbo", // Or "gpt-4-turbo", etc.
                "messages", List.of(message),
                "response_format", Map.of("type", "json_object") // Instructs the model to return valid JSON
            );
            HttpEntity<Map<String, Object>> requestEntity = new HttpEntity<>(requestBody, headers);

            logger.info("Calling LLM API at {} with prompt: {}", llmApiUrl, prompt);

            // The response from OpenAI is also a complex JSON object, so we parse it as a Map.
            ResponseEntity<Map> responseEntity = restTemplate.postForEntity(llmApiUrl, requestEntity, Map.class);

            if (responseEntity.getStatusCode().is2xxSuccessful() && responseEntity.getBody() != null) {
                Map<String, Object> responseMap = responseEntity.getBody();
                logger.debug("Full LLM API response: {}", responseMap);

                // The actual content is nested inside "choices" -> "message" -> "content"
                List<Map<String, Object>> choices = (List<Map<String, Object>>) responseMap.get("choices");
                if (choices != null && !choices.isEmpty()) {
                    Map<String, Object> firstChoice = choices.get(0);
                    Map<String, String> messageContent = (Map<String, String>) firstChoice.get("message");
                    String content = messageContent.get("content");

                    logger.info("LLM API response content: {}", content);

                    // If the expected response is a String (e.g., for generateVibeProfile), return it directly
                    if (responseType.equals(String.class)) {
                        return (T) content;
                    }
                    
                    // Otherwise, parse the JSON content string into the desired DTO
                    try {
                        return objectMapper.readValue(content, responseType);
                    } catch (JsonProcessingException jsonEx) {
                        logger.error("Failed to parse LLM response content '{}' into type {}: {}", content, responseType.getName(), jsonEx.getMessage());
                        return null; // Or throw a more specific exception if you want to propagate it
                    }
                }
                logger.warn("LLM API response did not contain any 'choices'.");
                return null;
            } else {
                logger.error("LLM API call failed with status: {} and body: {}", responseEntity.getStatusCode(),
                        responseEntity.getBody());
                return null;
            }
        } catch (Exception e) {
            logger.error("Error calling LLM API: {}", e.getMessage(), e);
            // Return a default/empty object based on the responseType
            return null;
        }
    }

    private String getLocationCategory(Location location) {
        if (location == null)
            return "Unknown";
        if (location.getIsRestaurant() != null && location.getIsRestaurant())
            return "Restaurant";
        if (location.getIsBar() != null && location.getIsBar())
            return "Bar";
        if (location.getIsClub() != null && location.getIsClub())
            return "Club";
        if (location.getIsLandmark() != null && location.getIsLandmark())
            return "Landmark";
        return "Other";
    }
}
