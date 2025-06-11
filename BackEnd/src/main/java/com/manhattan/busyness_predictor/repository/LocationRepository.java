package com.manhattan.busyness_predictor.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.manhattan.busyness_predictor.model.Location;

@Repository
public interface LocationRepository extends JpaRepository<Location, Integer> {

        // Basic type queries
        List<Location> findByIsRestaurantTrue();

        List<Location> findByIsBarTrue();

        List<Location> findByIsClubTrue();

        List<Location> findByIsLandmarkTrue();

        // Unified type query
        @Query("SELECT l FROM Location l WHERE " +
                        "(:type = 'restaurant' AND l.isRestaurant = true) OR " +
                        "(:type = 'bar' AND l.isBar = true) OR " +
                        "(:type = 'club' AND l.isClub = true) OR " +
                        "(:type = 'landmark' AND l.isLandmark = true)")
        List<Location> findByType(@Param("type") String type);

        // Search by name or description
        List<Location> findByNameOrDescription(String name, String description);

        // Price range queries
        List<Location> findByIsRestaurantTrueAndPriceBetween(Integer minPrice, Integer maxPrice);

        List<Location> findByIsBarTrueAndPriceBetween(Integer minPrice, Integer maxPrice);

        // Nearby locations queries
        @Query(value = "SELECT * FROM locations WHERE " +
                        "(6371 * acos(cos(radians(:lat)) * cos(radians(lat)) * " +
                        "cos(radians(lng) - radians(:lng)) + sin(radians(:lat)) * " +
                        "sin(radians(lat)))) < :radius", nativeQuery = true)
        List<Location> findNearbyLocations(@Param("lat") Double lat,
                        @Param("lng") Double lng,
                        @Param("radius") Double radius);

        @Query(value = "SELECT * FROM locations WHERE " +
                        "(6371 * acos(cos(radians(:lat)) * cos(radians(lat)) * " +
                        "cos(radians(lng) - radians(:lng)) + sin(radians(:lat)) * " +
                        "sin(radians(lat)))) < :radius AND " +
                        "((:type = 'restaurant' AND is_restaurant = true) OR " +
                        "(:type = 'bar' AND is_bar = true) OR " +
                        "(:type = 'club' AND is_club = true) OR " +
                        "(:type = 'landmark' AND is_landmark = true))", nativeQuery = true)
        List<Location> findNearbyLocationsByType(
                        @Param("lat") Double lat,
                        @Param("lng") Double lng,
                        @Param("radius") Double radius,
                        @Param("type") String type);

        // Review-based queries
        @Query("SELECT l FROM Location l WHERE l.id IN " +
                        "(SELECT r.locationId FROM Review r WHERE r.timestamp > :since " +
                        "GROUP BY r.locationId ORDER BY COUNT(r.id) DESC)")
        List<Location> findMostReviewedSince(@Param("since") LocalDateTime since);

        @Query("SELECT l FROM Location l WHERE " +
                        "(SELECT AVG(r.reviewVal) FROM Review r WHERE r.locationId = l.id) >= :minRating")
        List<Location> findByReview(@Param("minRating") Float minRating);
}