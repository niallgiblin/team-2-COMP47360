package com.manhattan.busyness_predictor.config;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
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

            String line;
            reader.readLine(); // Skip header row

            while ((line = reader.readLine()) != null) { 
                // Regex to split by comma, but ignore commas inside quotes
                // For more complex CSVs, consider using a library like OpenCSV.
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

                try {
                    Location location = new Location();
                    // ID is auto-generated, so we skip fields[0]
                    location.setLat(parseDouble(fields[1]));
                    location.setLng(parseDouble(fields[2]));
                    location.setName(parseString(fields[3]));
                    location.setAddress(parseString(fields[4]));
                    location.setUri(parseString(fields[5]));
                    location.setReview(parseRating(fields[6])); // Corrected method for Float
                    location.setNumReviews(parseInt(fields[7]));

                    String locType = parseString(fields[8]);
                    if (locType != null) {
                        String lowerLocType = locType.toLowerCase();
                        location.setIsRestaurant(
                                lowerLocType.contains("restaurant")
                        );
                        location.setIsBar(lowerLocType.contains("bar"));
                        location.setIsClub(lowerLocType.contains("club"));
                        location.setIsLandmark(
                                lowerLocType.contains("landmark") ||
                                lowerLocType.contains("historical")
                        );
                    }

                    location.setPrice(parsePrice(fields[10]));
                    location.setZone(parseString(fields[11]));
                    location.setInformation(parseString(fields[12]));
                    location.setSummary(parseString(fields[13]));
                    location.setDescription(parseString(fields[9]));
                    location.setTags(parseString(fields[14]));

                    locationRepository.save(location);
                } catch (Exception e) {
                    logger.error(
                            "Failed to parse or save line: '{}'. Error: {}",
                            line, e.getMessage(), e
                    );
                }
            }
            logger.info(
                    "Successfully imported {} locations from CSV.",
                    locationRepository.count()
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