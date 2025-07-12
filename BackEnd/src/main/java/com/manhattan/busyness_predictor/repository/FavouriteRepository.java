package com.manhattan.busyness_predictor.repository;

import com.manhattan.busyness_predictor.model.Favourite;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface FavouriteRepository extends JpaRepository<Favourite, Integer> {
    List<Favourite> findByUserId(Integer userId);
    Optional<Favourite> findByUserIdAndVenueId(Integer userId, Integer venueId);
    void deleteByUserIdAndVenueId(Integer userId, Integer venueId);
}
