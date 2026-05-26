package com.manhattan.busyness_predictor.security;

import java.io.IOException;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.manhattan.busyness_predictor.dto.ApiErrorResponse;
import com.manhattan.busyness_predictor.security.RateLimitService.RateLimitResult;

import org.springframework.http.HttpStatus;
import org.springframework.lang.NonNull;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Map<String, String> EXPENSIVE_ROUTES = Map.of(
            "POST /api/vibe/search", "vibe-search",
            "POST /api/vibe/similar", "vibe-similar",
            "GET /api/vibe/map-data", "vibe-map-data",
            "GET /api/vibe/trending", "vibe-trending");

    private final RateLimitService rateLimitService;
    private final ObjectMapper objectMapper;

    public RateLimitFilter(RateLimitService rateLimitService, ObjectMapper objectMapper) {
        this.rateLimitService = rateLimitService;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        String routeGroup = resolveRouteGroup(request);
        if (routeGroup == null) {
            filterChain.doFilter(request, response);
            return;
        }

        RateLimitResult result = rateLimitService.consume(rateLimitKey(request, routeGroup));
        if (result.isAllowed()) {
            filterChain.doFilter(request, response);
            return;
        }

        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType("application/json");
        if (result.getRetryAfterSeconds() > 0) {
            response.setHeader("Retry-After", Long.toString(result.getRetryAfterSeconds()));
        }
        objectMapper.writeValue(response.getWriter(), ApiErrorResponse.of(
                "Too many requests",
                "Too many requests",
                HttpStatus.TOO_MANY_REQUESTS.value(),
                "RATE_LIMITED"));
    }

    private String resolveRouteGroup(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (path.endsWith("/") && path.length() > 1) {
            path = path.substring(0, path.length() - 1);
        }
        return EXPENSIVE_ROUTES.get(request.getMethod() + " " + path);
    }

    private String rateLimitKey(HttpServletRequest request, String routeGroup) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof UserPrincipal userPrincipal) {
            return "user:" + userPrincipal.getId() + ":" + routeGroup;
        }
        return "ip:" + clientIp(request) + ":" + routeGroup;
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
