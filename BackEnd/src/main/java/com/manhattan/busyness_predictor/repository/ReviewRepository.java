package com.manhattan.busyness_predictor.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.manhattan.busyness_predictor.model.Review;

@Repository
public interface ReviewRepository extends JpaRepository<Review, Long> {

    List<Review> findByLocationId(Long locationId);

    List<Review> findByLocationIdOrderByTimestampDesc(Long locationId);

    List<Review> findByUserId(Long userId);

    List<Review> findByUserIdOrderByTimestampDesc(Long userId);

    boolean existsByUserIdAndLocationId(Long userId, Long locationId);

    // Find reviews by rating range
    List<Review> findByLocationIdAndReviewValBetween(Long locationId, Float minRating, Float maxRating);

    // Count reviews for a location
    long countByLocationId(Long locationId);

    // Get average rating for a location
    @Query("SELECT AVG(r.reviewVal) FROM Review r WHERE r.locationId = :locationId")
    Double getAverageRatingByLocationId(@Param("locationId") Long locationId);
}