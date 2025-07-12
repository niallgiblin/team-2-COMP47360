package com.manhattan.busyness_predictor.service;

import com.manhattan.busyness_predictor.model.Favourite;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.FavouriteRepository;
import com.manhattan.busyness_predictor.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class FavouriteService {

    @Autowired
    private FavouriteRepository favouriteRepository;

    @Autowired
    private UserRepository userRepository;

    public List<Favourite> getFavouritesByUser(Integer userId) {
        return favouriteRepository.findByUserId(userId);
    }

    public Favourite addFavourite(Integer userId, Integer venueId) {
        if (favouriteRepository.findByUserIdAndVenueId(userId, venueId).isPresent()) {
            throw new RuntimeException("Already favourited.");
        }
        User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        Favourite fav = new Favourite();
        fav.setUser(user);
        fav.setVenueId(venueId);
        return favouriteRepository.save(fav);
    }

    public void removeFavourite(Integer userId, Integer venueId) {
        favouriteRepository.deleteByUserIdAndVenueId(userId, venueId);
    }
}
