package com.manhattan.busyness_predictor.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web configuration to register JWT authentication interceptor and configure CORS.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Autowired
    private JwtAuthenticationInterceptor jwtAuthenticationInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(jwtAuthenticationInterceptor)
                // Paths that require authentication
                .addPathPatterns("/api/plans/**")        // Plan-related APIs
                .addPathPatterns("/api/auth/profile")    // GET profile API
                .addPathPatterns("/api/auth/profile/**") // PUT profile API

                // Paths excluded from authentication
                .excludePathPatterns("/api/auth/login")   // Login endpoint (public)
                .excludePathPatterns("/api/auth/signup")  // Signup endpoint (public)
                .excludePathPatterns("/api/vibe/**")      // Venue data APIs (public)
                .excludePathPatterns("/api/location/**")  // Location data APIs (public)
                .excludePathPatterns("/api/review/**")    // Review data APIs (public)
                .excludePathPatterns("/api/busyness/**")  // Busyness data APIs (public)
                .excludePathPatterns("/error")            // Error page
                .excludePathPatterns("/favicon.ico")      // Favicon
                .excludePathPatterns("/actuator/**");     // Actuator endpoints (if present)
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("*") // Allow all origins (development)
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH")
                .allowedHeaders("*")
                .allowCredentials(true)
                .exposedHeaders("Authorization") // Expose Authorization header to the client
                .maxAge(3600);                  // Cache pre-flight response for 1 hour
    }
}
