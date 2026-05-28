package com.manhattan.busyness_predictor.service;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import com.opencsv.CSVParserBuilder;
import com.opencsv.CSVReader;
import com.opencsv.CSVReaderBuilder;

@Service
public class LocationCsvImporter {

    private static final Logger logger = LoggerFactory.getLogger(LocationCsvImporter.class);
    private static final int MIN_FIELD_COUNT = 15;

    @Autowired
    private LocationRepository locationRepository;

    public int importAll() {
        return importFromResource("data/locations.csv");
    }

    public int importFromResource(String classpathResource) {
        int processed = 0;
        try (
                InputStream is = new ClassPathResource(classpathResource).getInputStream();
                InputStreamReader reader = new InputStreamReader(is, StandardCharsets.UTF_8);
                CSVReader csv = new CSVReaderBuilder(reader)
                        .withCSVParser(new CSVParserBuilder().build())
                        .build()
        ) {
            String[] headers = csv.readNext();
            if (headers == null) {
                logger.error("CSV file is empty: {}", classpathResource);
                return 0;
            }
            Map<String, Integer> headerMap = buildHeaderMap(headers);

            String[] fields;
            while ((fields = csv.readNext()) != null) {
                if (fields.length < MIN_FIELD_COUNT) {
                    logger.warn(
                            "Skipping malformed CSV line with {} fields in {}",
                            fields.length,
                            classpathResource
                    );
                    continue;
                }

                String zone = parseString(fieldAt(fields, headerMap, "zone"));
                if (zone == null || zone.isEmpty()) {
                    logger.warn(
                            "Skipping location with missing zone: {}",
                            fieldAt(fields, headerMap, "name")
                    );
                    continue;
                }

                try {
                    Location incoming = mapRow(fields, headerMap, zone);
                    upsert(incoming);
                    processed++;
                } catch (Exception e) {
                    logger.error(
                            "Failed to parse CSV row in {}: {}",
                            classpathResource,
                            e.getMessage(),
                            e
                    );
                }
            }
        } catch (Exception e) {
            logger.error("Failed to read or process '{}'", classpathResource, e);
        }
        return processed;
    }

    private void upsert(Location incoming) {
        Location toPersist = locationRepository.findById(incoming.getId())
                .map(existing -> {
                    copyAllMappedFields(existing, incoming);
                    return existing;
                })
                .orElse(incoming);
        locationRepository.save(toPersist);
    }

    private void copyAllMappedFields(Location existing, Location incoming) {
        existing.setLat(incoming.getLat());
        existing.setLng(incoming.getLng());
        existing.setName(incoming.getName());
        existing.setAddress(incoming.getAddress());
        existing.setUri(incoming.getUri());
        existing.setReview(incoming.getReview());
        existing.setNumReviews(incoming.getNumReviews());
        existing.setIsRestaurant(incoming.getIsRestaurant());
        existing.setIsBar(incoming.getIsBar());
        existing.setIsClub(incoming.getIsClub());
        existing.setIsLandmark(incoming.getIsLandmark());
        existing.setPrice(incoming.getPrice());
        existing.setZone(incoming.getZone());
        existing.setInformation(incoming.getInformation());
        existing.setSummary(incoming.getSummary());
        existing.setDescription(incoming.getDescription());
        existing.setTags(incoming.getTags());
    }

    private Location mapRow(String[] fields, Map<String, Integer> headerMap, String zone) {
        Location location = new Location();
        location.setId(parseInt(fieldAt(fields, headerMap, "id")));
        location.setLat(parseDouble(fieldAt(fields, headerMap, "lat")));
        location.setLng(parseDouble(fieldAt(fields, headerMap, "long")));
        location.setName(parseString(fieldAt(fields, headerMap, "name")));
        location.setAddress(parseString(fieldAt(fields, headerMap, "addr")));
        location.setUri(parseString(fieldAt(fields, headerMap, "uri")));
        location.setReview(parseRating(fieldAt(fields, headerMap, "reviews")));
        location.setNumReviews(parseInt(fieldAt(fields, headerMap, "num_reviews")));

        String locType = parseString(fieldAt(fields, headerMap, "loc_type"));
        if (locType != null) {
            String lowerLocType = locType.toLowerCase();
            location.setIsRestaurant(lowerLocType.contains("restaurant"));
            location.setIsBar(lowerLocType.contains("bar"));
            location.setIsClub(lowerLocType.contains("club"));
            location.setIsLandmark(
                    lowerLocType.contains("landmark") || lowerLocType.contains("historical")
            );
        }

        location.setPrice(parsePrice(fieldAt(fields, headerMap, "price")));
        location.setZone(zone);
        location.setInformation(parseString(fieldAt(fields, headerMap, "Info")));
        location.setSummary(parseString(fieldAt(fields, headerMap, "summary")));
        location.setDescription(parseString(fieldAt(fields, headerMap, "description")));
        location.setTags(parseString(fieldAt(fields, headerMap, "tags")));
        return location;
    }

    private Map<String, Integer> buildHeaderMap(String[] headers) {
        Map<String, Integer> headerMap = new HashMap<>();
        for (int i = 0; i < headers.length; i++) {
            headerMap.put(headers[i].trim(), i);
        }
        return headerMap;
    }

    private String fieldAt(String[] fields, Map<String, Integer> headerMap, String column) {
        Integer index = headerMap.get(column);
        if (index == null || index >= fields.length) {
            return null;
        }
        return fields[index];
    }

    private Integer parseInt(String value) {
        if (
                value == null || value.trim().isEmpty() || "null".equalsIgnoreCase(value.trim())
        ) {
            return null;
        }
        try {
            return Integer.parseInt(value.replaceAll("[^\\d.]", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Double parseDouble(String value) {
        if (
                value == null || value.trim().isEmpty() || "null".equalsIgnoreCase(value.trim())
        ) {
            return null;
        }
        try {
            return Double.parseDouble(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String parseString(String value) {
        if (
                value == null || value.trim().isEmpty() || "null".equalsIgnoreCase(value.trim())
        ) {
            return null;
        }
        return value.trim().replaceAll("^\"|\"$", "");
    }

    private Float parseRating(String value) {
        if (
                value == null ||
                value.trim().isEmpty() ||
                "no rating".equalsIgnoreCase(value.trim())
        ) {
            return null;
        }
        Pattern pattern = Pattern.compile("(\\d+(\\.\\d+)?)");
        Matcher matcher = pattern.matcher(value);
        if (matcher.find()) {
            try {
                return Float.parseFloat(matcher.group(1));
            } catch (NumberFormatException e) {
                // fall through
            }
        }
        return null;
    }

    private Integer parsePrice(String value) {
        if (value == null || value.trim().isEmpty()) {
            return 3;
        }
        String lowerValue = value.toLowerCase();
        if (lowerValue.contains("very cheap")) return 1;
        if (lowerValue.contains("cheap")) return 2;
        if (lowerValue.contains("moderate") || lowerValue.contains("mid")) return 3;
        if (lowerValue.contains("expensive")) return 4;
        if (lowerValue.contains("very expensive") || lowerValue.contains("luxury")) return 5;
        return 3;
    }
}
