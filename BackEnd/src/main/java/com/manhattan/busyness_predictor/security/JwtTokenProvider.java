package com.manhattan.busyness_predictor.security;

import java.util.Date;

import javax.crypto.SecretKey;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.manhattan.busyness_predictor.model.User;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;

@Component
public class JwtTokenProvider {

    private static final Logger logger = LoggerFactory.getLogger(JwtTokenProvider.class);

    // It's crucial to have a strong, secret key stored securely, not hardcoded.
    // This approach generates a new key on every application startup, which means
    // all existing JWTs will be invalidated on restart. For production, consider
    // using a static, configured secret.
    private final SecretKey jwtSecretKey = Jwts.SIG.HS512.key().build();

    @Value("${app.jwtExpirationInMs:86400000}") // Default to 24 hours
    private int jwtExpirationInMs;

    public String generateToken(User user) {
        Integer userId = user.getId();
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + jwtExpirationInMs);

        return Jwts.builder()
                .subject(Integer.toString(userId))
                .issuedAt(new Date())
                .expiration(expiryDate)
                .signWith(jwtSecretKey) // Algorithm is inferred from the key
                .compact();
    }

    public Integer getUserIdFromJWT(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(jwtSecretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();

        return Integer.parseInt(claims.getSubject());
    }

    public boolean validateToken(String authToken) {
        try {
            Jwts.parser().verifyWith(jwtSecretKey).build().parseSignedClaims(authToken);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            // Catching a broader exception is cleaner and covers all JWT-related issues.
            logger.error("JWT validation error: {}", e.getMessage());
        }
        return false;
    }
}