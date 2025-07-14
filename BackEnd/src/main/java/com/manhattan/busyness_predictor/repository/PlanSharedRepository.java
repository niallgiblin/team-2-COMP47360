package com.manhattan.busyness_predictor.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.manhattan.busyness_predictor.model.Plan;
import com.manhattan.busyness_predictor.model.PlanShared;
import com.manhattan.busyness_predictor.model.User;

@Repository
public interface PlanSharedRepository extends JpaRepository<PlanShared, Integer> {

    // Find all users a plan is shared with
    List<PlanShared> findByPlan(Plan plan);

    // Find all plans shared with a specific user
    List<PlanShared> findByUser(User user);

    // Check if a plan is shared with a specific user
    boolean existsByPlanAndUser(Plan plan, User user);

    // Remove sharing for a specific plan and user
    @Modifying
    @Transactional
    @Query("DELETE FROM PlanShared ps WHERE ps.plan = :plan AND ps.user = :user")
    void removeSharing(@Param("plan") Plan plan, @Param("user") User user);

    // Remove all sharing for a specific plan
    @Modifying
    @Transactional
    void deleteByPlan(Plan plan);

    // Get user IDs that a plan is shared with
    @Query("SELECT ps.user.id FROM PlanShared ps WHERE ps.plan = :plan")
    List<Integer> findUserIdsByPlan(@Param("plan") Plan plan);
}