package com.manhattan.busyness_predictor.dto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.manhattan.busyness_predictor.model.Location;

/**
 * Audit-gated zoneId tests for MAP-04.
 *
 * Repository {@code Location.zone} values are human-readable Manhattan zone names
 * (for example {@code Alphabet City}), not canonical {@code manhattanZones.geojson}
 * {@code feature.properties.LocationID} numeric identifiers. Backend {@code zoneId}
 * therefore remains null and the frontend Turf polygon fallback stays required.
 */
class LocationDtoTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /**
     * Representative {@code Location.zone} values sampled from
     * {@code BackEnd/src/main/resources/data/locations.csv}.
     */
    private static final List<String> REPRESENTATIVE_ZONE_VALUES = List.of(
            "Alphabet City",
            "Battery Park",
            "Central Park",
            "Greenwich Village North",
            "Midtown East",
            "Upper East Side South",
            "West Village");

    private static final Path GEOJSON_PATH = Path.of(System.getProperty("user.dir"))
            .getParent()
            .resolve("frontend/public/manhattanZones.geojson");

    @Test
    @DisplayName("Audit: representative Location.zone values are not canonical GeoJSON LocationID strings")
    void auditRepresentativeZonesAreNotCanonicalLocationIds() throws IOException {
        Set<String> geoJsonLocationIds = loadGeoJsonLocationIds();
        Map<String, String> zoneNameToLocationId = loadGeoJsonZoneNameToLocationId();

        for (String zone : REPRESENTATIVE_ZONE_VALUES) {
            assertFalse(
                    geoJsonLocationIds.contains(zone),
                    "Location.zone '" + zone + "' is a human-readable name, not a LocationID; "
                            + "backend zoneId derivation is not audit-proven (MAP-04 polygon fallback required)");

            assertTrue(
                    zoneNameToLocationId.containsKey(zone),
                    "Representative zone '" + zone + "' must exist in manhattanZones.geojson properties.zone");

            String locationId = zoneNameToLocationId.get(zone);
            assertFalse(
                    zone.equals(locationId),
                    "Zone name '" + zone + "' maps to LocationID '" + locationId
                            + "' in GeoJSON but Location.zone stores the name, not the ID");
        }
    }

    @Test
    @DisplayName("fromLocation preserves human-readable zone unchanged for audited values")
    void fromLocationPreservesHumanReadableZone() {
        for (String zone : REPRESENTATIVE_ZONE_VALUES) {
            Location location = sampleLocation(zone);

            LocationDto dto = LocationDto.fromLocation(location);

            assertEquals(zone, dto.getZone(), "zone must remain the original human-readable string");
        }
    }

    @Test
    @DisplayName("fromLocation leaves zoneId null for audited human-readable zones (MAP-04 polygon fallback)")
    void fromLocationLeavesZoneIdNullForAuditedHumanReadableZones() {
        for (String zone : REPRESENTATIVE_ZONE_VALUES) {
            Location location = sampleLocation(zone);

            LocationDto dto = LocationDto.fromLocation(location);

            assertNull(
                    dto.getZoneId(),
                    "zoneId must be null for human-readable zone '" + zone
                            + "' because repository audit found no canonical LocationID in Location.zone");
        }
    }

    @Test
    @DisplayName("fromLocation leaves zoneId null for numeric zone strings (repository does not use LocationID)")
    void fromLocationLeavesZoneIdNullForNumericZoneStrings() {
        Location location = sampleLocation("4");

        LocationDto dto = LocationDto.fromLocation(location);

        assertNull(
                dto.getZoneId(),
                "Even numeric zone strings are not audit-proven canonical LocationIDs in repository data");
        assertEquals("4", dto.getZone());
    }

    private static Location sampleLocation(String zone) {
        Location location = new Location();
        location.setId(1);
        location.setName("Audit Venue");
        location.setZone(zone);
        location.setLat(40.7128);
        location.setLng(-74.0060);
        location.setIsRestaurant(true);
        return location;
    }

    private static Set<String> loadGeoJsonLocationIds() throws IOException {
        JsonNode root = OBJECT_MAPPER.readTree(GEOJSON_PATH.toFile());
        Set<String> ids = new HashSet<>();
        for (JsonNode feature : root.get("features")) {
            JsonNode locationId = feature.get("properties").get("LocationID");
            if (locationId != null && !locationId.isNull()) {
                ids.add(String.valueOf(locationId.asInt()));
            }
        }
        return ids;
    }

    private static Map<String, String> loadGeoJsonZoneNameToLocationId() throws IOException {
        JsonNode root = OBJECT_MAPPER.readTree(GEOJSON_PATH.toFile());
        Map<String, String> mapping = new HashMap<>();
        for (JsonNode feature : root.get("features")) {
            JsonNode properties = feature.get("properties");
            if (properties == null) {
                continue;
            }
            JsonNode zoneName = properties.get("zone");
            JsonNode locationId = properties.get("LocationID");
            if (zoneName != null && locationId != null && !locationId.isNull()) {
                mapping.put(zoneName.asText(), String.valueOf(locationId.asInt()));
            }
        }
        return mapping;
    }
}
