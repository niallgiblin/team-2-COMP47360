package com.manhattan.busyness_predictor.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.UserRepository;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Interceptor that authenticates incoming requests by verifying a simplified JWT token.
 * Token format: "token_userId_timestamp".
 */
@Component
public class JwtAuthenticationInterceptor implements HandlerInterceptor {

    @Autowired
    private UserRepository userRepository;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // Allow CORS preflight requests without authentication
        if ("OPTIONS".equals(request.getMethod())) {
            return true;
        }

        String authHeader = request.getHeader("Authorization");

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);

            // Expected token structure: "token_userId_timestamp"
            if (token.startsWith("token_")) {
                try {
                    String[] parts = token.split("_");
                    if (parts.length >= 2) {
                        Integer userId = Integer.parseInt(parts[1]);

                        // Check that the user exists in the database
                        User user = userRepository.findById(userId).orElse(null);
                        if (user != null) {
                            // Optionally validate token timestamp for expiration
                            if (parts.length >= 3) {
                                try {
                                    long timestamp = Long.parseLong(parts[2]);
                                    long currentTime = System.currentTimeMillis();
                                    long tokenAge = currentTime - timestamp;

                                    // Token expiration: 24 hours (in milliseconds)
                                    long maxAge = 24 * 60 * 60 * 1000L;

                                    if (tokenAge > maxAge) {
                                        // Token has expired
                                        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                                        response.setContentType("application/json");
                                        response.getWriter().write("{\"error\":\"Token expired\"}");
                                        return false;
                                    }
                                } catch (NumberFormatException e) {
                                    // Timestamp parse failure; user is valid, allow for backward compatibility
                                    System.err.println("Warning: Could not parse token timestamp: " + token);
                                }
                            }

                            // Attach user object to request for controller access
                            request.setAttribute("user", user);
                            return true; // Continue processing
                        }
                    }
                } catch (NumberFormatException e) {
                    // Invalid token format; fall through to failure
                    System.err.println("Invalid token format: " + token);
                }
            }
        }

        // Authentication failed, return 401
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"Unauthorized - Invalid or missing token\"}");
        return false; // Stop further processing
    }
}
