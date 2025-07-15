package com.manhattan.busyness_predictor.config;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import com.manhattan.busyness_predictor.repository.UserRepository;

@Component
public class DataInitializer implements CommandLineRunner {

    private static final Logger logger = LoggerFactory.getLogger(DataInitializer.class);

    @Autowired
    private LocationRepository locationRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) throws Exception {
        seedUsers();
        seedLocations();
    }

    private void seedLocations() {
        // Only load data if the location table is empty to prevent duplicates on restart
        if (locationRepository.count() > 0) {
            logger.info("Location data already exists. Skipping CSV import.");
            return;
        }

        logger.info(
                "Location table is empty. Starting CSV data import from 'data/locations.csv'..."
        );

        try (InputStream is = new ClassPathResource("data/locations.csv").getInputStream();
             BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {

            // Read header to dynamically find column indices
            String headerLine = reader.readLine();
            if (headerLine == null) {
                logger.error("CSV file is empty.");
                return;
            }
            String[] headers = headerLine.split(",(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)", -1);
            Map<String, Integer> headerMap = new HashMap<>();
            for (int i = 0; i < headers.length; i++) {
                headerMap.put(headers[i].trim(), i);
            }

            List<Location> locationsToSave = new ArrayList<>();
            String line;

            while ((line = reader.readLine()) != null) { 
                String[] fields = line.split(
                        ",(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)",
                        -1
                );

                if (fields.length < 15) {
                    logger.warn(
                            "Skipping malformed CSV line with {} fields: {}",
                            fields.length, line
                    );
                    continue;
                }

                // --- DATA VALIDATION: Skip rows with no zone ---
                String zone = parseString(fields[headerMap.get("zone")]);
                if (zone == null || zone.isEmpty()) {
                    logger.warn("Skipping location with missing zone: {}", fields[headerMap.get("name")]);
                    continue;
                }

                try {
                    Location location = new Location();
                    // --- KEY FIX: Use the ID from the CSV file ---
                    location.setId(parseInt(fields[headerMap.get("id")]));
                    location.setLat(parseDouble(fields[headerMap.get("lat")]));
                    location.setLng(parseDouble(fields[headerMap.get("long")]));
                    location.setName(parseString(fields[headerMap.get("name")]));
                    location.setAddress(parseString(fields[headerMap.get("addr")]));
                    location.setUri(parseString(fields[headerMap.get("uri")]));
                    location.setReview(parseRating(fields[headerMap.get("reviews")]));
                    location.setNumReviews(parseInt(fields[headerMap.get("num_reviews")]));

                    String locType = parseString(fields[headerMap.get("loc_type")]);
                    if (locType != null) {
                        String lowerLocType = locType.toLowerCase();
                        location.setIsRestaurant(lowerLocType.contains("restaurant"));
                        location.setIsBar(lowerLocType.contains("bar"));
                        location.setIsClub(lowerLocType.contains("club"));
                        location.setIsLandmark(
                                lowerLocType.contains("landmark") ||
                                lowerLocType.contains("historical")
                        );
                    }

                    location.setPrice(parsePrice(fields[headerMap.get("price")]));
                    location.setZone(zone);
                    location.setInformation(parseString(fields[headerMap.get("Info")]));
                    location.setSummary(parseString(fields[headerMap.get("summary")]));
                    location.setDescription(parseString(fields[headerMap.get("description")]));
                    location.setTags(parseString(fields[headerMap.get("tags")]));

                    locationsToSave.add(location);
                } catch (Exception e) {
                    logger.error(
                            "Failed to parse or save line: '{}'. Error: {}",
                            line, e.getMessage(), e
                    );
                }
            }
            locationRepository.saveAll(locationsToSave);
            logger.info(
                    "Successfully imported {} locations from CSV.",
                    locationsToSave.size()
            );
        } catch (Exception e) {
            logger.error("Failed to read or process 'data/locations.csv'", e);
        }
    }

    private void seedUsers() {
        if (userRepository.count() > 0) {
            logger.info("User data already exists. Skipping user seeding.");
            return;
        }

        logger.info("Seeding initial user data...");

        User user1 = new User();
        user1.setUsername("testuser");
        user1.setEmail("test@example.com");
        user1.setPassword(passwordEncoder.encode("password"));
        user1.setFirstName("Test");
        user1.setLastName("User");
        user1.setCreatedAt(LocalDateTime.now());
        user1.setUpdatedAt(LocalDateTime.now());
        userRepository.save(user1);

        User user2 = new User();
        user2.setUsername("janedoe");
        user2.setEmail("jane@example.com");
        user2.setPassword(passwordEncoder.encode("password123"));
        user2.setFirstName("Jane");
        user2.setLastName("Doe");
        user2.setCreatedAt(LocalDateTime.now());
        user2.setUpdatedAt(LocalDateTime.now());
        userRepository.save(user2);

        logger.info("Successfully seeded 2 users.");
    }

    // Helper methods to safely parse potentially empty or malformed fields
    private Integer parseInt(String value) {
        if (
                value == null || value.trim().isEmpty() || "null".equalsIgnoreCase(value.trim())
        ) {
            return null;
        }
        try {
            // Extract numbers from strings like "12172"
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
        // Remove quotes if they exist
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
                // This case is unlikely if the regex matches, but it's safe to handle
            }
        }
        return null;
    }

    private Integer parsePrice(String value) {
        if (value == null || value.trim().isEmpty()) {
            return 3; // Default to moderate
        }
        String lowerValue = value.toLowerCase();
        if (lowerValue.contains("very cheap")) return 1;
        if (lowerValue.contains("cheap")) return 2;
        if (lowerValue.contains("moderate") || lowerValue.contains("mid")) return 3;
        if (lowerValue.contains("expensive")) return 4;
        if (lowerValue.contains("very expensive") || lowerValue.contains("luxury")) return 5;
        return 3; // Default
    }
}