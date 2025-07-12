package com.manhattan.busyness_predictor.controller;

import com.manhattan.busyness_predictor.model.Favourite;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.UserRepository;
import com.manhattan.busyness_predictor.service.FavouriteService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/likes")
public class FavouriteController {

    @Autowired
    private FavouriteService favouriteService;

    @Autowired
    private UserRepository userRepository;

    // Get all favourites for the current user
    @GetMapping
    public ResponseEntity<List<Favourite>> getFavourites(@AuthenticationPrincipal UserDetails userDetails) {
        Integer userId = extractUserIdFromPrincipal(userDetails);
        List<Favourite> list = favouriteService.getFavouritesByUser(userId);
        return ResponseEntity.ok(list);
    }

    // Add a venue to the user's favourites
    @PostMapping
    public ResponseEntity<Favourite> likeVenue(@RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails userDetails) {
        Integer venueId = Integer.valueOf(body.get("venueId").toString());
        Integer userId = extractUserIdFromPrincipal(userDetails);
        Favourite fav = favouriteService.addFavourite(userId, venueId);
        return ResponseEntity.ok(fav);
    }

    // Remove a venue from the user's favourites
    @DeleteMapping("/{venueId}")
    public ResponseEntity<?> unlikeVenue(@PathVariable Integer venueId, @AuthenticationPrincipal UserDetails userDetails) {
        Integer userId = extractUserIdFromPrincipal(userDetails);
        favouriteService.removeFavourite(userId, venueId);
        return ResponseEntity.ok().build();
    }

    // Extract the user ID from the JWT/Spring Security principal
    private Integer extractUserIdFromPrincipal(UserDetails userDetails) {
        String username = userDetails.getUsername();
        User user = userRepository.findByUsername(username)
            .orElseThrow(() -> new RuntimeException("User not found"));
        return user.getId();
    }
}

