package com.manhattan.busyness_predictor.service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.manhattan.busyness_predictor.dto.GooglePlacesReviewDto;
import com.manhattan.busyness_predictor.dto.GooglePlacesReviewDto.ReviewEntry;
import com.manhattan.busyness_predictor.model.Location;

@Service
public class GooglePlacesService {

    private static final Logger logger = LoggerFactory.getLogger(GooglePlacesService.class);
    private static final String PLACES_BASE_URL = "https://maps.googleapis.com/maps/api/place";
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(8);

    private final String apiKey;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    // Cache for find-place results: queryKey → placeId
    private final Cache<String, String> placeIdCache;

    // Cache for place details: placeId → GooglePlacesReviewDto
    private final Cache<String, GooglePlacesReviewDto> placeDetailsCache;

    public GooglePlacesService(
            @Value("${app.google.api-key:}") String apiKey,
            @Value("${app.google.places.place-id-cache-ttl-seconds:86400}") long placeIdCacheTtlSeconds,
            @Value("${app.google.places.details-cache-ttl-seconds:3600}") long detailsCacheTtlSeconds) {
        this.apiKey = apiKey;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(REQUEST_TIMEOUT)
                .build();
        this.objectMapper = new ObjectMapper();
        this.placeIdCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(placeIdCacheTtlSeconds))
                .maximumSize(5000)
                .executor(Runnable::run)
                .build();
        this.placeDetailsCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(detailsCacheTtlSeconds))
                .maximumSize(5000)
                .executor(Runnable::run)
                .build();
    }

    /**
     * Fetches Google Places reviews for a venue.
     * First resolves the Google Place ID from venue name + address, then fetches details.
     */
    public GooglePlacesReviewDto getPlaceReviews(Location location) {
        if (apiKey == null || apiKey.isBlank()) {
            return errorResponse("Google Places API key is not configured");
        }

        String cacheKey = buildCacheKey(location);
        GooglePlacesReviewDto cached = placeDetailsCache.getIfPresent(cacheKey);
        if (cached != null) {
            // If previously cached as error but >5 min, retry
            if (cached.getError() != null) {
                logger.debug("Cached error for {}, retrying", location.getName());
            } else {
                logger.debug("Returning cached Google Places data for {}", location.getName());
                return cached;
            }
        }

        // Step 1: Find the Google Place ID
        String placeId = findPlaceId(location);
        if (placeId == null) {
            GooglePlacesReviewDto error = errorResponse("Could not find Google Place ID for " + location.getName());
            placeDetailsCache.put(cacheKey, error);
            return error;
        }

        // Step 2: Fetch place details (rating + reviews)
        GooglePlacesReviewDto result = fetchPlaceDetails(placeId, location.getName());
        placeDetailsCache.put(cacheKey, result);
        return result;
    }

    /**
     * Fetches Google Places reviews using a direct place ID search.
     */
    public GooglePlacesReviewDto getPlaceReviewsByPlaceId(String placeId) {
        if (apiKey == null || apiKey.isBlank()) {
            return errorResponse("Google Places API key is not configured");
        }

        GooglePlacesReviewDto cached = placeDetailsCache.getIfPresent(placeId);
        if (cached != null && cached.getError() == null) {
            return cached;
        }

        GooglePlacesReviewDto result = fetchPlaceDetails(placeId, null);
        placeDetailsCache.put(placeId, result);
        return result;
    }

    /**
     * Finds the Google Place ID for a venue using the Find Place From Text API.
     */
    private String findPlaceId(Location location) {
        // Build query from venue name and address
        String query = (location.getName() != null ? location.getName() : "") +
                (location.getAddress() != null ? " " + location.getAddress() : "");
        String queryKey = query.toLowerCase().trim();

        // Check cache
        String cached = placeIdCache.getIfPresent(queryKey);
        if (cached != null) {
            return cached.isEmpty() ? null : cached;
        }

        try {
            String encodedQuery = URLEncoder.encode(query, StandardCharsets.UTF_8);
            String url = PLACES_BASE_URL + "/findplacefromtext/json" +
                    "?input=" + encodedQuery +
                    "&inputtype=textquery" +
                    "&fields=place_id" +
                    "&key=" + apiKey;

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(REQUEST_TIMEOUT)
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                logger.warn("Find place API returned status {} for query '{}'",
                        response.statusCode(), query);
                placeIdCache.put(queryKey, "");
                return null;
            }

            JsonNode root = objectMapper.readTree(response.body());
            String status = root.path("status").asText();

            if (!"OK".equals(status)) {
                logger.warn("Find place API status '{}' for query '{}': {}",
                        status, query, root.path("error_message").asText(""));
                placeIdCache.put(queryKey, "");
                return null;
            }

            JsonNode candidates = root.path("candidates");
            if (candidates.isArray() && candidates.size() > 0) {
                String placeId = candidates.get(0).path("place_id").asText();
                if (placeId != null && !placeId.isBlank()) {
                    logger.debug("Found Place ID {} for '{}'", placeId, query);
                    placeIdCache.put(queryKey, placeId);
                    return placeId;
                }
            }

            placeIdCache.put(queryKey, "");
            return null;
        } catch (Exception e) {
            logger.error("Error finding place ID for '{}': {}", query, e.getMessage());
            return null;
        }
    }

    /**
     * Fetches detailed place information including reviews from Google Places API.
     */
    private GooglePlacesReviewDto fetchPlaceDetails(String placeId, String fallbackName) {
        try {
            String url = PLACES_BASE_URL + "/details/json" +
                    "?place_id=" + URLEncoder.encode(placeId, StandardCharsets.UTF_8) +
                    "&fields=name,rating,user_ratings_total,reviews,price_level" +
                    "&language=en" +
                    "&key=" + apiKey;

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(REQUEST_TIMEOUT)
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                logger.warn("Place Details API returned status {} for placeId {}",
                        response.statusCode(), placeId);
                return errorResponse("Google Places API returned HTTP " + response.statusCode());
            }

            JsonNode root = objectMapper.readTree(response.body());
            String status = root.path("status").asText();

            if (!"OK".equals(status)) {
                String errorMsg = root.path("error_message").asText("");
                logger.warn("Place Details API status '{}' for placeId {}: {}",
                        status, placeId, errorMsg);
                if ("REQUEST_DENIED".equals(status)) {
                    return errorResponse("Google Places API access denied. Check API key restrictions.");
                }
                return errorResponse("Google Places API returned status: " + status);
            }

            JsonNode result = root.path("result");
            GooglePlacesReviewDto dto = new GooglePlacesReviewDto();
            dto.setPlaceId(placeId);
            dto.setPlaceName(result.path("name").asText(fallbackName));
            dto.setGoogleRating(result.has("rating") ? result.path("rating").asDouble() : null);
            dto.setTotalRatings(result.has("user_ratings_total") ? result.path("user_ratings_total").asInt() : null);
            dto.setAttribution("Powered by Google");

            // Parse reviews
            JsonNode reviewsNode = result.path("reviews");
            if (reviewsNode.isArray() && reviewsNode.size() > 0) {
                List<ReviewEntry> reviews = new ArrayList<>();
                for (JsonNode reviewNode : reviewsNode) {
                    ReviewEntry entry = new ReviewEntry();
                    entry.setAuthorName(reviewNode.path("author_name").asText("Anonymous"));
                    entry.setProfilePhotoUrl(reviewNode.path("profile_photo_url").asText(null));
                    entry.setRating(reviewNode.path("rating").asDouble(0));
                    entry.setText(reviewNode.path("text").asText(""));
                    entry.setTime(reviewNode.path("time").asLong(0));
                    entry.setRelativeTimeDescription(reviewNode.path("relative_time_description").asText(""));
                    reviews.add(entry);
                }
                dto.setReviews(reviews);
            }

            logger.info("Fetched Google Places details for '{}': rating={}, reviews={}",
                    dto.getPlaceName(), dto.getGoogleRating(),
                    dto.getReviews() != null ? dto.getReviews().size() : 0);

            return dto;
        } catch (Exception e) {
            logger.error("Error fetching place details for placeId {}: {}", placeId, e.getMessage());
            return errorResponse("Failed to fetch Google Places data: " + e.getMessage());
        }
    }

    private String buildCacheKey(Location location) {
        return String.format("%s|%s|%.6f|%.6f",
                location.getName() != null ? location.getName() : "",
                location.getAddress() != null ? location.getAddress() : "",
                location.getLat() != null ? location.getLat() : 0.0,
                location.getLng() != null ? location.getLng() : 0.0);
    }

    private GooglePlacesReviewDto errorResponse(String error) {
        GooglePlacesReviewDto dto = new GooglePlacesReviewDto();
        dto.setError(error);
        return dto;
    }
}
