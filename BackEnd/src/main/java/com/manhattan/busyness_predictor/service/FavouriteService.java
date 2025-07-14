package com.manhattan.busyness_predictor.service;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.manhattan.busyness_predictor.model.Favourite;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.FavouriteRepository;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import com.manhattan.busyness_predictor.repository.UserRepository;

@Service
public class FavouriteService {

    @Autowired
    private FavouriteRepository favouriteRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private LocationRepository locationRepository;

    public List<Favourite> getFavouritesByUser(Integer userId) {
        return favouriteRepository.findByUser_Id(userId);
    }

    @Transactional
    public Favourite addFavourite(Integer userId, Integer venueId) {
        if (favouriteRepository.findByUser_IdAndLocation_Id(userId, venueId).isPresent()) {
            throw new RuntimeException("Already favourited.");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        Location location = locationRepository.findById(venueId)
                .orElseThrow(() -> new RuntimeException("Location not found"));
        Favourite fav = new Favourite();
        fav.setUser(user);
        fav.setLocation(location);
        return favouriteRepository.save(fav);
    }

    @Transactional
    public void removeFavourite(Integer userId, Integer venueId) {
        // It's safer to check for existence before deleting.
        Favourite favourite = favouriteRepository.findByUser_IdAndLocation_Id(userId, venueId)
                .orElseThrow(() -> new RuntimeException("Cannot remove favourite: not found."));
        favouriteRepository.delete(favourite);
    }
}
