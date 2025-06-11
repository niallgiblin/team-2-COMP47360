package com.manhattan.busyness_predictor.service;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.manhattan.busyness_predictor.model.Shared;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import com.manhattan.busyness_predictor.repository.SharedRepository;

@Service
public class SharedService {

    @Autowired
    private SharedRepository sharedRepository;

    @Autowired
    private LocationRepository locationRepository;

    public void shareLocation(Integer senderId, Integer receiverId, Integer locationId) {
        // Check if location exists
        locationRepository.findById(locationId)
                .orElseThrow(() -> new RuntimeException("Location not found"));

        // TODO: Verify that receiverId is a valid user and possibly a
        // friend

        Shared shared = new Shared(senderId, receiverId, locationId);
        sharedRepository.save(shared);
    }

    public List<Shared> getSharedWithUser(Integer userId) {
        return sharedRepository.findByReceiverIdOrderBySharedAtDesc(userId);
    }

    public List<Shared> getSharedByUser(Integer userId) {
        return sharedRepository.findBySenderIdOrderBySharedAtDesc(userId);
    }
}