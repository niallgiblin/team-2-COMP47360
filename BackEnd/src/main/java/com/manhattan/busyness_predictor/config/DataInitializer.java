package com.manhattan.busyness_predictor.config;

import java.time.LocalDateTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.UserRepository;
import com.manhattan.busyness_predictor.service.LocationCsvImporter;

@Component
public class DataInitializer implements CommandLineRunner {

    private static final Logger logger = LoggerFactory.getLogger(DataInitializer.class);

    @Autowired
    private LocationCsvImporter locationCsvImporter;

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
        int imported = locationCsvImporter.importAll();
        logger.info("Location CSV import finished: {} rows processed.", imported);
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
}
