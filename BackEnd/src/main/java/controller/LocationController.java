package controller;

@RestController
@RequestMapping("/api/locations")
@CrossOrigin(origins = "http://localhost:4137") // Vite/React url
public class LocationController {

    @Autowired
    private LocationService locationService;

    // Load Map - Fetch all/subset locations
    @GetMapping
    public ResponseEntity<List<Location>> getAllLocations(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng,
            @RequestParam(required = false, defaultValue = "10") Double radius) {

        List<Location> locations;

        if (type != null) {
            // Filter by type (restaurant, bar, club etc)
            locations = locationService.getLocationsByType(type);
        } else if (lat != null && lng != null) {
            // Get locations within radius
            locations = locationService.getLocationsNearby(lat, lng, radius);
        } else {
            // Get all locations
            locations = locationService.getAllLocations();
        }

        return ResponseEntity.ok(locations);
    }

    // Click on location - fetch location information & busyness prediction
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getLocationDetails(@PathVariable Long id) {
        try {
            Location location = locationService.getLocationById(id);

            // TODO: Add busyness data when API is ready
            Map<String, Object> response = new HashMap<>();
            response.put("location", location);
            response.put("busyness", "Coming soon"); // Placeholder

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    // Find nearby locations by type
    @GetMapping("/nearby")
    public ResponseEntity<List<Location>> getNearbyLocations(
            @RequestParam Double lat,
            @RequestParam Double lng,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "5") Double radius) {

        List<Location> locations = locationService.getNearbyLocationsByType(lat, lng, radius, type);
        return ResponseEntity.ok(locations);
    }

    // What's trending right now
    @GetMapping("/trending")
    public ResponseEntity<List<Location>> getTrendingLocations() {
        // For now, return most reviewed locations
        List<Location> trending = locationService.getTrendingLocations();
        return ResponseEntity.ok(trending);
    }
}