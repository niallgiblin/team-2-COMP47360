package com.manhattan.busyness_predictor.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.manhattan.busyness_predictor.model.Review;

@Repository
public interface ReviewRepository extends JpaRepository<Review, Integer> {

    List<Review> findByLocationId(Integer locationId);

    List<Review> findByLocationIdOrderByTimestampDesc(Integer locationId);

    List<Review> findByUserId(Integer userId);

    List<Review> findByUserIdOrderByTimestampDesc(Integer userId);

    boolean existsByUserIdAndLocationId(Integer userId, Integer locationId);

    // Find reviews by rating range
    List<Review> findByLocationIdAndReviewValBetween(Integer locationId, Float minRating, Float maxRating);

    // Count reviews for a location
    Integer countByLocationId(Integer locationId);

    // Get average rating for a location
    @Query("SELECT AVG(r.reviewVal) FROM Review r WHERE r.locationId = :locationId")
    Double getAverageRatingByLocationId(@Param("locationId") Integer locationId);
}