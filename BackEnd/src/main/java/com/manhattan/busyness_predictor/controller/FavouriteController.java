package com.manhattan.busyness_predictor.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.manhattan.busyness_predictor.dto.FavouriteRequest;
import com.manhattan.busyness_predictor.model.Favourite;
import com.manhattan.busyness_predictor.service.FavouriteService;

@RestController
@RequestMapping("/api/favourites")
public class FavouriteController extends BaseController {

    @Autowired
    private FavouriteService favouriteService;

    // Get all favourites for the current user
    @GetMapping
    public ResponseEntity<List<Favourite>> getFavourites(@AuthenticationPrincipal UserDetails userDetails) {
        Integer userId = getCurrentUser(userDetails).getId();
        List<Favourite> list = favouriteService.getFavouritesByUser(userId);
        return ResponseEntity.ok(list);
    }

    // Add a venue to the user's favourites
    @PostMapping
    public ResponseEntity<Favourite> likeVenue(@RequestBody FavouriteRequest request, @AuthenticationPrincipal UserDetails userDetails) {
        Integer venueId = request.getVenueId();
        Integer userId = getCurrentUser(userDetails).getId();
        Favourite fav = favouriteService.addFavourite(userId, venueId);
        return ResponseEntity.ok(fav);
    }

    // Remove a venue from the user's favourites
    @DeleteMapping("/{venueId}")
    public ResponseEntity<?> unlikeVenue(@PathVariable Integer venueId, @AuthenticationPrincipal UserDetails userDetails) {
        Integer userId = getCurrentUser(userDetails).getId();
        favouriteService.removeFavourite(userId, venueId);
        return ResponseEntity.ok().build();
    }
}
