package com.manhattan.busyness_predictor.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.manhattan.busyness_predictor.repository.LocationRepository;

@Service
public class LocationCsvImporter {

    @Autowired
    private LocationRepository locationRepository;

    public int importAll() {
        return importFromResource("data/locations.csv");
    }

    public int importFromResource(String classpathResource) {
        throw new UnsupportedOperationException("Not implemented — plan 09-03");
    }
}
