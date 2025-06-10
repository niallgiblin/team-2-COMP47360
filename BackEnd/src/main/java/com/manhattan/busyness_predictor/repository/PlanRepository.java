package com.manhattan.busyness_predictor.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.manhattan.busyness_predictor.model.Plan;

@Repository
public interface PlanRepository extends JpaRepository<Plan, Integer> {

    // Find plans created by a specific user
    List<Plan> findByCreatedByOrderByDateDesc(Integer createdBy);

    // Find plans created by a user after a specific date (future plans)
    @Query("SELECT p FROM Plan p WHERE p.createdBy = :userId AND p.date >= :currentDate ORDER BY p.date ASC")
    List<Plan> findFuturePlansByUser(@Param("userId") Integer userId, @Param("currentDate") LocalDateTime currentDate);

    // Find plans created by a user before a specific date (past plans)
    @Query("SELECT p FROM Plan p WHERE p.createdBy = :userId AND p.date < :currentDate ORDER BY p.date DESC")
    List<Plan> findPastPlansByUser(@Param("userId") Integer userId, @Param("currentDate") LocalDateTime currentDate);

    // Find shared plans for a user (plans shared with them)
    @Query("SELECT p FROM Plan p JOIN PlanShared ps ON p.id = ps.planId WHERE ps.userId = :userId ORDER BY p.date DESC")
    List<Plan> findSharedPlansForUser(@Param("userId") Integer userId);

    // Find all plans accessible to a user (created by them or shared with them)
    @Query("SELECT DISTINCT p FROM Plan p LEFT JOIN PlanShared ps ON p.id = ps.planId " +
            "WHERE p.createdBy = :userId OR ps.userId = :userId ORDER BY p.date DESC")
    List<Plan> findAllAccessiblePlansForUser(@Param("userId") Integer userId);
}