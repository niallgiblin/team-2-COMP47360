package com.manhattan.busyness_predictor.service;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.manhattan.busyness_predictor.model.History;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.HistoryRepository;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import com.manhattan.busyness_predictor.repository.UserRepository;

@Service
public class HistoryService {

    @Autowired
    private HistoryRepository historyRepository;

    @Autowired
    private LocationRepository locationRepository;

    @Autowired
    private UserRepository userRepository;

    @Transactional
    public void addToHistory(Integer userId, Integer locationId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        Location location = locationRepository.findById(locationId)
                .orElseThrow(() -> new RuntimeException("Location not found"));

        History history = new History(user, location);
        historyRepository.save(history);
    }

    public List<Location> getSearchHistory(Integer userId) {
        User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        List<History> historyEntries = historyRepository.findByUserOrderByTimestampDesc(user);

        return historyEntries.stream()
                .map(History::getLocation)
                .distinct() // Remove duplicates
                .collect(Collectors.toList());
    }

    @Transactional
    public void clearHistory(Integer userId) {
        User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        List<History> userHistory = historyRepository.findByUser(user);
        historyRepository.deleteAll(userHistory);
    }
}