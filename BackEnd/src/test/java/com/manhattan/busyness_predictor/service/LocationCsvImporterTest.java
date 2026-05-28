package com.manhattan.busyness_predictor.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.repository.LocationRepository;

@ExtendWith(MockitoExtension.class)
class LocationCsvImporterTest {

    @Mock
    private LocationRepository locationRepository;

    @InjectMocks
    private LocationCsvImporter locationCsvImporter;

    @Captor
    private ArgumentCaptor<Location> locationCaptor;

    @BeforeEach
    void setUp() {
        when(locationRepository.findById(any())).thenReturn(Optional.empty());
        when(locationRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    @DisplayName("D-10: quoted commas — parsed Location retains full address string")
    void importQuotedCommasPreservesFullAddress() {
        locationCsvImporter.importFromResource("data/locations-test-quoted-commas.csv");

        verify(locationRepository).save(locationCaptor.capture());
        assertEquals("123 Main St, Suite 4, New York, NY", locationCaptor.getValue().getAddress());
    }

    @Test
    @DisplayName("D-10: embedded quotes — escaped double quotes parse to expected value")
    void importEmbeddedQuotesParsesCorrectly() {
        locationCsvImporter.importFromResource("data/locations-test-quoted-commas.csv");

        verify(locationRepository).save(locationCaptor.capture());
        assertEquals(
                "A venue with \"embedded\" quotes in description",
                locationCaptor.getValue().getDescription());
    }

    @Test
    @DisplayName("D-10: empty fields — nullable columns become null without throwing")
    void importEmptyFieldsBecomeNull() {
        locationCsvImporter.importFromResource("data/locations-test-upsert.csv");

        verify(locationRepository, times(2)).save(locationCaptor.capture());
        Location firstSaved = locationCaptor.getAllValues().get(0);
        assertNull(firstSaved.getInformation());
        assertNull(firstSaved.getTags());
    }

    @Test
    @DisplayName("D-10: missing zone — row skipped and repository save never called for that row")
    void importMissingZoneSkipsRowWithoutSave() {
        locationCsvImporter.importFromResource("data/locations-test-missing-zone.csv");

        verify(locationRepository, times(1)).save(locationCaptor.capture());
        assertEquals("Valid Zone Venue", locationCaptor.getValue().getName());
        assertEquals(90002, locationCaptor.getValue().getId());
    }

    @Test
    @DisplayName("D-10: malformed row — short row skipped with no exception propagation")
    void importMalformedRowSkippedWithoutException() {
        locationCsvImporter.importFromResource("data/locations-test-malformed.csv");

        verify(locationRepository, never()).save(any());
    }

    @Test
    @DisplayName("D-10: upsert idempotency — same ID imported twice yields deterministic result")
    void importUpsertFixtureIsIdempotent() {
        locationCsvImporter.importFromResource("data/locations-test-upsert.csv");
        locationCsvImporter.importFromResource("data/locations-test-upsert.csv");

        verify(locationRepository, times(4)).save(locationCaptor.capture());
        Location finalLocation = locationCaptor.getAllValues().get(locationCaptor.getAllValues().size() - 1);
        assertEquals(90005, finalLocation.getId());
        assertEquals("Updated Name", finalLocation.getName());
        assertEquals("Updated info", finalLocation.getInformation());
        assertEquals("Updated summary", finalLocation.getSummary());
        assertEquals("updated,tags", finalLocation.getTags());
    }
}
