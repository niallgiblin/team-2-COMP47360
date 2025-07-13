package com.manhattan.busyness_predictor.service;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

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

    public void removeFavourite(Integer userId, Integer venueId) {
        favouriteRepository.deleteByUser_IdAndLocation_Id(userId, venueId);
    }
}
