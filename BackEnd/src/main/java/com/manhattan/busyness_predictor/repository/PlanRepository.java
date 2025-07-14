package com.manhattan.busyness_predictor.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.manhattan.busyness_predictor.model.Plan;

@Repository
public interface PlanRepository extends JpaRepository<Plan, Integer> {

    // Search for the plan based on the user ID in reverse order of creation time
    List<Plan> findByCreatedBy_IdOrderByCreatedAtDesc(Integer userId);

    // Find a specific plan for a particular user
    @Query("SELECT p FROM Plan p WHERE p.id = :planId AND p.createdBy.id = :userId")
    Optional<Plan> findByIdAndCreatedBy_Id(Integer planId, Integer userId);
}