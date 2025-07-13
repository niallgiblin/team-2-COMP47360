package com.manhattan.busyness_predictor.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * General web configuration. Security interceptors are now handled in
 * SecurityConfig.java.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {
    // The JwtAuthenticationInterceptor has been removed from here.
    // All security is now handled by the SecurityFilterChain in SecurityConfig.java,
    // which is the standard and more robust approach.
}
