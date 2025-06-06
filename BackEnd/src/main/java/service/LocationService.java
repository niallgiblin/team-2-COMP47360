package service;

@Service
public class LocationService {

    @Autowired
    private LocationRepository locationRepository;

    public List<Location> getAllLocations() {
        return locationRepository.findAll();
    }

    public Location getLocationById(Long id) {
        return locationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Location not found"));
    }

    public List<Location> getLocationsByType(String type) {
        switch (type.toLowerCase()) {
            case "restaurant":
                return locationRepository.findByIsRestaurantTrue();
            case "bar":
                return locationRepository.findByIsBarTrue();
            case "club":
                return locationRepository.findByIsClubTrue();
            case "landmark":
                return locationRepository.findByIsLandmarkTrue();
            default:
                return locationRepository.findAll();
        }
    }

    public List<Location> getLocationsNearby(Double lat, Double lng, Double radius) {
        // Using Haversine formula for distance calculation
        return locationRepository.findNearbyLocations(lat, lng, radius);
    }

    public List<Location> getNearbyLocationsByType(Double lat, Double lng, Double radius, String type) {
        if (type == null) {
            return getLocationsNearby(lat, lng, radius);
        }

        // Get nearby locations first, then filter by type
        List<Location> nearby = getLocationsNearby(lat, lng, radius);
        return nearby.stream()
                .filter(location -> matchesType(location, type))
                .collect(Collectors.toList());
    }

    public List<Location> getTrendingLocations() {
        // For now, return locations with most reviews in last 30 days
        LocalDateTime thirtyDaysAgo = LocalDateTime.now().minusDays(30);
        return locationRepository.findMostReviewedSince(thirtyDaysAgo);
    }
}
