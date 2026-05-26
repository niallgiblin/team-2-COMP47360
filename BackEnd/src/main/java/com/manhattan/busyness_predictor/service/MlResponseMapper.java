package com.manhattan.busyness_predictor.service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.manhattan.busyness_predictor.dto.BusynessReportDto;
import com.manhattan.busyness_predictor.dto.MlLocationDto;
import com.manhattan.busyness_predictor.dto.MlSearchResponse;
import com.manhattan.busyness_predictor.model.Location;

@Component
public class MlResponseMapper {

    private static final Pattern RATING_PATTERN = Pattern.compile("(\\d+(\\.\\d+)?)");

    public List<Location> toLocations(MlSearchResponse response) {
        if (response == null || response.getResults() == null) {
            return Collections.emptyList();
        }
        List<Location> locations = new ArrayList<>();
        for (MlLocationDto dto : response.getResults()) {
            Location location = toLocation(dto);
            if (location != null) {
                locations.add(location);
            }
        }
        return locations;
    }

    public Map<String, Double> toPredictions(BusynessReportDto dto) {
        if (dto == null || dto.getPredictions() == null) {
            return Collections.emptyMap();
        }
        return new HashMap<>(dto.getPredictions());
    }

    public List<Object> toForecast(BusynessReportDto dto) {
        if (dto == null || dto.getForecast() == null) {
            return Collections.emptyList();
        }
        return new ArrayList<>(dto.getForecast());
    }

    Location toLocation(MlLocationDto dto) {
        if (dto == null) {
            return null;
        }
        try {
            Location location = new Location();
            location.setId(dto.getId());
            location.setName(dto.getName());
            location.setAddress(resolveAddress(dto));
            location.setLat(resolveLatitude(dto));
            location.setLng(resolveLongitude(dto));
            location.setDescription(dto.getDescription());
            location.setPrice(parsePrice(dto.getPrice()));
            location.setReview(resolveRating(dto));
            location.setZone(dto.getZone());
            location.setSimilarity(dto.getSimilarity());
            applyTypeFlags(location, resolveType(dto));
            return location;
        } catch (Exception e) {
            return null;
        }
    }

    private String resolveAddress(MlLocationDto dto) {
        if (dto.getAddress() != null) {
            return dto.getAddress();
        }
        return dto.getAddr();
    }

    private Double resolveLatitude(MlLocationDto dto) {
        if (dto.getLatitude() != null) {
            return dto.getLatitude();
        }
        return dto.getLat();
    }

    private Double resolveLongitude(MlLocationDto dto) {
        if (dto.getLongitude() != null) {
            return dto.getLongitude();
        }
        return dto.getLongValue();
    }

    private String resolveType(MlLocationDto dto) {
        return dto.getType();
    }

    private Float resolveRating(MlLocationDto dto) {
        if (dto.getRating() != null) {
            return dto.getRating().floatValue();
        }
        return parseRating(dto.getReviews());
    }

    private void applyTypeFlags(Location location, String type) {
        if (type == null || type.isBlank()) {
            return;
        }
        String lower = type.toLowerCase();
        location.setIsRestaurant(lower.contains("restaurant"));
        location.setIsBar(lower.contains("bar"));
        location.setIsClub(lower.contains("club") || lower.contains("nightlife"));
        location.setIsLandmark(lower.contains("landmark"));
    }

    private Integer parsePrice(Object priceObj) {
        if (priceObj == null) {
            return null;
        }
        if (priceObj instanceof Number number) {
            return number.intValue();
        }
        String value = priceObj.toString().trim();
        if (value.isEmpty()) {
            return null;
        }
        if (value.matches("^\\$+$")) {
            return Math.min(value.length(), 5);
        }

        String lowerValue = value.toLowerCase();
        if (lowerValue.contains("very cheap")) {
            return 1;
        }
        if (lowerValue.contains("cheap")) {
            return 2;
        }
        if (lowerValue.contains("moderate") || lowerValue.contains("mid")) {
            return 3;
        }
        if (lowerValue.contains("very expensive") || lowerValue.contains("luxury")) {
            return 5;
        }
        if (lowerValue.contains("expensive")) {
            return 4;
        }

        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    Float parseRating(Object ratingObj) {
        if (ratingObj == null) {
            return 0f;
        }
        if (ratingObj instanceof Number number) {
            return number.floatValue();
        }
        String ratingStr = ratingObj.toString();
        Matcher matcher = RATING_PATTERN.matcher(ratingStr);
        if (matcher.find()) {
            try {
                return Float.parseFloat(matcher.group(1));
            } catch (NumberFormatException e) {
                return 0f;
            }
        }
        return 0f;
    }
}
