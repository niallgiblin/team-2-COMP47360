package com.manhattan.busyness_predictor.service;

import com.manhattan.busyness_predictor.model.Favourite;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.repository.FavouriteRepository;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class FavouriteService {

    @Autowired
    private FavouriteRepository favouriteRepository;

    @Autowired
    private LocationRepository locationRepository;

    public void addToFavourites(Long userId, Long locationId) {
        // Check if location exists
        locationRepository.findById(locationId)
                .orElseThrow(() -> new RuntimeException("Location not found"));

        // Check if already favourited
        if (favouriteRepository.existsByUserIdAndLocationId(userId, locationId)) {
            throw new RuntimeException("Location is already in favourites");
        }

        Favourite favourite = new Favourite(userId, locationId);
        favouriteRepository.save(favourite);
    }

    public void removeFromFavourites(Long userId, Long locationId) {
        Favourite favourite = favouriteRepository.findByUserIdAndLocationId(userId, locationId)
                .orElseThrow(() -> new RuntimeException("Location is not in favourites"));

        favouriteRepository.delete(favourite);
    }

    public List<Location> getFavouriteLocations(Long userId) {
        List<Favourite> favourites = favouriteRepository.findByUserId(userId);

        return favourites.stream()
                .map(fav -> locationRepository.findById(fav.getLocationId()))
                .filter(opt -> opt.isPresent())
                .map(opt -> opt.get())
                .collect(Collectors.toList());
    }

    public boolean isFavourited(Long userId, Long locationId) {
        return favouriteRepository.existsByUserIdAndLocationId(userId, locationId);
    }
}