package com.manhattan.busyness_predictor.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.manhattan.busyness_predictor.model.Favourite;

@Repository
public interface FavouriteRepository extends JpaRepository<Favourite, Integer> {

    List<Favourite> findByUserId(Integer userId);

    List<Favourite> findByLocationId(Integer locationId);

    Optional<Favourite> findByUserIdAndLocationId(Integer userId, Integer locationId);

    boolean existsByUserIdAndLocationId(Integer userId, Integer locationId);

    void deleteByUserIdAndLocationId(Integer userId, Integer locationId);

    // Count how many users favourited a location
    long countByLocationId(Integer locationId);
}