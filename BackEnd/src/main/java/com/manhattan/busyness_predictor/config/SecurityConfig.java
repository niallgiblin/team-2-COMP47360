package com.manhattan.busyness_predictor.config;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.manhattan.busyness_predictor.security.JwtAuthenticationFilter;

/**
 * Security configuration to disable default Spring Security behavior and allow
 * the
 * JwtAuthenticationInterceptor to handle route protection.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Autowired
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        // This configuration disables default security, sets up a stateless session
        // policy for JWT, and adds our custom filter to the chain.
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource())) // Apply CORS config
                .csrf(AbstractHttpConfigurer::disable) // Disable CSRF
                // Set session management to stateless, as we are using JWTs
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Allow CORS preflight requests
                        .requestMatchers(HttpMethod.OPTIONS, "/api/**").permitAll()
                        // Define public endpoints for authentication
                        .requestMatchers("/api/auth/login", "/api/auth/signup").permitAll()
                        // Allow public search and viewing of locations and vibes
                        .requestMatchers(HttpMethod.POST, "/api/vibe/search").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/vibe/**", "/api/locations/**").permitAll()
                        // All other API routes must be authenticated
                        .requestMatchers("/api/**").authenticated()
                        // Permit any other requests that don't match (e.g., root, static assets)
                        .anyRequest().permitAll())
                // Add our custom JWT filter to the security chain before the default username/password filter
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        // Add EC2 public IP to allowed origins for frontend
        config.setAllowedOrigins(List.of(
            "http://localhost:5173",
            "http://localhost:3000",
            "http://34.246.193.191:5173"
        ));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        config.setExposedHeaders(List.of("Authorization"));
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config); // Apply CORS to all API routes
        return source;
    }
}
