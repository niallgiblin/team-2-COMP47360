package com.manhattan.busyness_predictor.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.Review;
import com.manhattan.busyness_predictor.model.User;

@Repository
public interface ReviewRepository extends JpaRepository<Review, Integer> {

    List<Review> findByLocation(Location location);

    List<Review> findByLocationOrderByTimestampDesc(Location location);

    List<Review> findByUser(User user);

    List<Review> findByUserOrderByTimestampDesc(User user);

    boolean existsByUserAndLocation(User user, Location location);

    // Find reviews by rating range
    List<Review> findByLocationAndReviewValBetween(Location location, Float minRating, Float maxRating);

    // Count reviews for a location
    Integer countByLocation(Location location);

    // Get average rating for a location
    @Query("SELECT AVG(r.reviewVal) FROM Review r WHERE r.location = :location")
    Double getAverageRatingByLocation(@Param("location") Location location);
}