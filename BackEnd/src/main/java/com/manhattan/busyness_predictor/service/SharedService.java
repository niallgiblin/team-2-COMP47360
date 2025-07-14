package com.manhattan.busyness_predictor.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.Shared;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import com.manhattan.busyness_predictor.repository.SharedRepository;
import com.manhattan.busyness_predictor.repository.UserRepository;

@Service
public class SharedService {

    private final SharedRepository sharedRepository;
    private final LocationRepository locationRepository;
    private final UserRepository userRepository;

    public SharedService(SharedRepository sharedRepository, LocationRepository locationRepository, UserRepository userRepository) {
        this.sharedRepository = sharedRepository;
        this.locationRepository = locationRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public void shareLocation(Integer senderId, Integer receiverId, Integer locationId) {
        User sender = userRepository.findById(senderId)
                .orElseThrow(() -> new RuntimeException("Sender not found"));
        
        User receiver = userRepository.findById(receiverId)
                .orElseThrow(() -> new RuntimeException("Receiver not found"));

        Location location = locationRepository.findById(locationId)
                .orElseThrow(() -> new RuntimeException("Location not found"));

        if (sender.getId().equals(receiver.getId())) {
            throw new RuntimeException("Cannot share a location with yourself.");
        }

        Shared shared = new Shared(sender, receiver, location);
        sharedRepository.save(shared);
    }

    public List<Shared> getSharedWithUser(Integer userId) {
        User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        return sharedRepository.findByReceiverOrderBySharedAtDesc(user);
    }

    public List<Shared> getSharedByUser(Integer userId) {
        User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        return sharedRepository.findBySenderOrderBySharedAtDesc(user);
    }
}