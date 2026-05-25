package com.manhattan.busyness_predictor.config;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class StartupConfigValidator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(StartupConfigValidator.class);

    @Value("${app.jwt.secret:}")             private String jwtSecret;
    @Value("${spring.datasource.url:}")      private String datasourceUrl;
    @Value("${spring.datasource.username:}") private String datasourceUsername;
    @Value("${spring.datasource.password:}") private String datasourcePassword;

    @Override
    public void run(ApplicationArguments args) {
        List<String> missing = new ArrayList<>();
        if (jwtSecret.isBlank())          missing.add("APP_JWT_SECRET");
        if (datasourceUrl.isBlank())      missing.add("SPRING_DATASOURCE_URL");
        if (datasourceUsername.isBlank()) missing.add("SPRING_DATASOURCE_USERNAME");
        if (datasourcePassword.isBlank()) missing.add("SPRING_DATASOURCE_PASSWORD");

        if (!missing.isEmpty()) {
            missing.forEach(v -> log.error("Required environment variable not set: {}", v));
            throw new IllegalStateException(
                "Application startup aborted: missing required environment variables: "
                + String.join(", ", missing)
            );
        }
        log.info("Startup configuration validated: all required env vars present.");
    }
}
