package com.manhattan.busyness_predictor.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.manhattan.busyness_predictor.model.Favourite;

@Repository
public interface FavouriteRepository extends JpaRepository<Favourite, Long> {

    List<Favourite> findByUserId(Long userId);

    List<Favourite> findByLocationId(Long locationId);

    Optional<Favourite> findByUserIdAndLocationId(Long userId, Long locationId);

    boolean existsByUserIdAndLocationId(Long userId, Long locationId);

    void deleteByUserIdAndLocationId(Long userId, Long locationId);

    // Count how many users favourited a location
    long countByLocationId(Long locationId);
}