package com.manhattan.busyness_predictor.controller;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.manhattan.busyness_predictor.dto.FavouriteDto;
import com.manhattan.busyness_predictor.dto.FavouriteRequest;
import com.manhattan.busyness_predictor.model.Favourite;
import com.manhattan.busyness_predictor.security.UserPrincipal;
import com.manhattan.busyness_predictor.service.FavouriteService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/favourites")
public class FavouriteController {
 
    @Autowired
    private FavouriteService favouriteService;
 
    // Get all favourites for the current user
    @GetMapping
    public ResponseEntity<List<FavouriteDto>> getFavourites(@AuthenticationPrincipal UserPrincipal currentUser) {
        Integer userId = currentUser.getId();
        List<Favourite> list = favouriteService.getFavouritesByUser(userId);
        List<FavouriteDto> dtoList = list.stream().map(FavouriteDto::fromFavourite).collect(Collectors.toList());
        return ResponseEntity.ok(dtoList);
    }
 
    // Add a venue to the user's favourites
    @PostMapping
    public ResponseEntity<FavouriteDto> likeVenue(@Valid @RequestBody FavouriteRequest request, @AuthenticationPrincipal UserPrincipal currentUser) {
        Integer venueId = request.getVenueId();
        Integer userId = currentUser.getId();
        Favourite fav = favouriteService.addFavourite(userId, venueId);
        FavouriteDto favDto = FavouriteDto.fromFavourite(fav);
        return ResponseEntity.status(HttpStatus.CREATED).body(favDto);
    }
 
    // Remove a venue from the user's favourites
    @DeleteMapping("/{venueId}")
    public ResponseEntity<Void> unlikeVenue(@PathVariable Integer venueId, @AuthenticationPrincipal UserPrincipal currentUser) {
        Integer userId = currentUser.getId();
        favouriteService.removeFavourite(userId, venueId);
        return ResponseEntity.noContent().build();
    }
}
