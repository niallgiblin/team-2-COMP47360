package repository;

@Repository
public interface LocationRepository extends JpaRepository<Location, Long> {

    // Find by type
    List<Location> findByIsRestaurantTrue();

    List<Location> findByIsBarTrue();

    List<Location> findByIsClubTrue();

    List<Location> findByIsLandmarkTrue();

    // Search by name or description
    List<Location> findByNameOrDescription(String name, String description);

    // Find by price range and type
    List<Location> findByIsRestaurantTrueAndPriceBetween(Integer minPrice, Integer maxPrice);

    List<Location> findByIsBarTrueAndPriceBetween(Integer minPrice, Integer maxPrice);

    // Custom query for nearby locations using Haversine formula
    @Query(value = "SELECT * FROM locations WHERE " +
            "(6371 * acos(cos(radians(:lat)) * cos(radians(lat)) * " +
            "cos(radians(lng) - radians(:lng)) + sin(radians(:lat)) * " +
            "sin(radians(lat)))) < :radius", nativeQuery = true)
    List<Location> findNearbyLocations(@Param("lat") Double lat,
            @Param("lng") Double lng,
            @Param("radius") Double radius);

    // Find most reviewed locations since a date (for trending)
    @Query("SELECT l FROM Location l WHERE l.id IN " +
            "(SELECT r.locationId FROM Review r WHERE r.timestamp > :since " +
            "GROUP BY r.locationId ORDER BY COUNT(r.id) DESC)")
    List<Location> findMostReviewedSince(@Param("since") LocalDateTime since);

    // Find locations with high ratings
    List<Location> findByReview(Float minRating);
}
