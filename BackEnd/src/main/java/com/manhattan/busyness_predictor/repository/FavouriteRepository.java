package com.manhattan.busyness_predictor.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.manhattan.busyness_predictor.model.Favourite;

public interface FavouriteRepository extends JpaRepository<Favourite, Integer> {

    List<Favourite> findByUser_Id(Integer userId);


    Optional<Favourite> findByUser_IdAndLocation_Id(Integer userId, Integer locationId);


    void deleteByUser_IdAndLocation_Id(Integer userId, Integer locationId);
}
