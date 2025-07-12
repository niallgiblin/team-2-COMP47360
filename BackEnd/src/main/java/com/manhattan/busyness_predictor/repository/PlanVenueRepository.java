package com.manhattan.busyness_predictor.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.manhattan.busyness_predictor.model.PlanVenue;

@Repository
public interface PlanVenueRepository extends JpaRepository<PlanVenue, Integer> {
    
    @Modifying
    @Transactional
    @Query("DELETE FROM PlanVenue pv WHERE pv.plan.id = :planId")
    void deleteByPlanId(@Param("planId") Integer planId);
}