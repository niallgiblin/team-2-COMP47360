package com.manhattan.busyness_predictor.model;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class LocationFieldPreservationTest {

    @Test
    @DisplayName("DATA-03 / D-13: setters preserve information, summary, and tags")
    void settersPreserveInformationSummaryAndTags() {
        Location location = new Location();
        location.setInformation("Detailed venue information");
        location.setSummary("Short summary for search");
        location.setTags("museum, history, culture");

        assertEquals("Detailed venue information", location.getInformation());
        assertEquals("Short summary for search", location.getSummary());
        assertEquals("museum, history, culture", location.getTags());
    }

    @Test
    @DisplayName("DATA-03 / D-13: empty string fields round-trip as empty, not null")
    void emptyStringFieldsRoundTrip() {
        Location location = new Location();
        location.setInformation("");
        location.setSummary("");
        location.setTags("");

        assertEquals("", location.getInformation());
        assertEquals("", location.getSummary());
        assertEquals("", location.getTags());
    }

    @Test
    @DisplayName("DATA-03 / D-13: reassigning fields overwrites previous values")
    void reassigningFieldsOverwritesPreviousValues() {
        Location location = new Location();
        location.setInformation("First info");
        location.setSummary("First summary");
        location.setTags("first,tags");

        location.setInformation("Second info");
        location.setSummary("Second summary");
        location.setTags("second,tags");

        assertEquals("Second info", location.getInformation());
        assertEquals("Second summary", location.getSummary());
        assertEquals("second,tags", location.getTags());
    }
}
