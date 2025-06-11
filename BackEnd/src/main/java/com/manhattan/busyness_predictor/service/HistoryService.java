package com.manhattan.busyness_predictor.service;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.manhattan.busyness_predictor.model.History;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.repository.HistoryRepository;
import com.manhattan.busyness_predictor.repository.LocationRepository;

@Service
public class HistoryService {

    @Autowired
    private HistoryRepository historyRepository;

    @Autowired
    private LocationRepository locationRepository;

    public void addToHistory(Integer userId, Integer locationId) {
        // Check if location exists
        locationRepository.findById(locationId)
                .orElseThrow(() -> new RuntimeException("Location not found"));

        History history = new History(userId, locationId);
        historyRepository.save(history);
    }

    public List<Location> getSearchHistory(Integer userId) {
        List<History> history = historyRepository.findByUserIdOrderByTimestampDesc(userId);

        return history.stream()
                .map(h -> locationRepository.findById(h.getLocationId()))
                .filter(opt -> opt.isPresent())
                .map(opt -> opt.get())
                .distinct() // Remove duplicates
                .collect(Collectors.toList());
    }

    public void clearHistory(Integer userId) {
        List<History> userHistory = historyRepository.findByUserId(userId);
        historyRepository.deleteAll(userHistory);
    }
}