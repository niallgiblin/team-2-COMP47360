package com.manhattan.busyness_predictor.service;

import com.manhattan.busyness_predictor.model.History;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.repository.HistoryRepository;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class HistoryService {

    @Autowired
    private HistoryRepository historyRepository;

    @Autowired
    private LocationRepository locationRepository;

    public void addToHistory(Long userId, Long locationId) {
        // Check if location exists
        locationRepository.findById(locationId)
                .orElseThrow(() -> new RuntimeException("Location not found"));

        History history = new History(userId, locationId);
        historyRepository.save(history);
    }

    public List<Location> getSearchHistory(Long userId) {
        List<History> history = historyRepository.findByUserIdOrderByTimestampDesc(userId);

        return history.stream()
                .map(h -> locationRepository.findById(h.getLocationId()))
                .filter(opt -> opt.isPresent())
                .map(opt -> opt.get())
                .distinct() // Remove duplicates
                .collect(Collectors.toList());
    }

    public void clearHistory(Long userId) {
        List<History> userHistory = historyRepository.findByUserId(userId);
        historyRepository.deleteAll(userHistory);
    }
}