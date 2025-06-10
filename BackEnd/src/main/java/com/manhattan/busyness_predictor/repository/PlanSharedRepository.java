package com.manhattan.busyness_predictor.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.manhattan.busyness_predictor.model.PlanShared;

@Repository
public interface PlanSharedRepository extends JpaRepository<PlanShared, Integer> {

    // Find all users a plan is shared with
    List<PlanShared> findByPlanId(Integer planId);

    // Find all plans shared with a specific user
    List<PlanShared> findByUserId(Integer userId);

    // Check if a plan is shared with a specific user
    boolean existsByPlanIdAndUserId(Integer planId, Integer userId);

    // Remove sharing for a specific plan and user
    @Modifying
    @Transactional
    @Query("DELETE FROM PlanShared ps WHERE ps.planId = :planId AND ps.userId = :userId")
    void removeSharing(@Param("planId") Integer planId, @Param("userId") Integer userId);

    // Remove all sharing for a specific plan
    @Modifying
    @Transactional
    void deleteByPlanId(Integer planId);

    // Get user IDs that a plan is shared with
    @Query("SELECT ps.userId FROM PlanShared ps WHERE ps.planId = :planId")
    List<Integer> findUserIdsByPlanId(@Param("planId") Integer planId);
}