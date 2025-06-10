package com.manhattan.busyness_predictor.service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.manhattan.busyness_predictor.dto.AddPlaceToPlanRequest;
import com.manhattan.busyness_predictor.dto.CreatePlanRequest;
import com.manhattan.busyness_predictor.dto.PlanResponse;
import com.manhattan.busyness_predictor.dto.SharePlanRequest;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.Plan;
import com.manhattan.busyness_predictor.model.PlanShared;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import com.manhattan.busyness_predictor.repository.PlanRepository;
import com.manhattan.busyness_predictor.repository.PlanSharedRepository;

@Service
public class PlanService {

    @Autowired
    private PlanRepository planRepository;

    @Autowired
    private PlanSharedRepository planSharedRepository;

    @Autowired
    private LocationRepository locationRepository;

    @Transactional
    public PlanResponse createPlan(CreatePlanRequest request, Integer userId) {
        // Create new plan
        Plan plan = new Plan();
        plan.setDate(request.getDate());
        plan.setCreatedBy(userId);
        plan.setCreatedAt(LocalDateTime.now());

        // Set locations (up to 3 based on your schema)
        List<Integer> locationIds = request.getLocationIds();
        if (locationIds != null && !locationIds.isEmpty()) {
            if (locationIds.size() >= 1)
                plan.setLoc1(locationIds.get(0));
            if (locationIds.size() >= 2)
                plan.setLoc2(locationIds.get(1));
            if (locationIds.size() >= 3)
                plan.setLoc3(locationIds.get(2));
        }

        Plan savedPlan = planRepository.save(plan);
        return convertToResponse(savedPlan);
    }

    @Transactional
    public PlanResponse addPlaceToPlan(AddPlaceToPlanRequest request, Integer userId) {
        Optional<Plan> planOpt = planRepository.findById(request.getPlanId());
        if (planOpt.isEmpty()) {
            throw new RuntimeException("Plan not found");
        }

        Plan plan = planOpt.get();

        // Check if user has permission to modify this plan
        if (!plan.getCreatedBy().equals(userId) &&
                !planSharedRepository.existsByPlanIdAndUserId(plan.getId(), userId)) {
            throw new RuntimeException("Access denied");
        }

        // Add location to the first available slot
        if (plan.getLoc1() == null) {
            plan.setLoc1(request.getLocationId());
        } else if (plan.getLoc2() == null) {
            plan.setLoc2(request.getLocationId());
        } else if (plan.getLoc3() == null) {
            plan.setLoc3(request.getLocationId());
        } else {
            throw new RuntimeException("Plan already has maximum number of locations (3)");
        }

        Plan updatedPlan = planRepository.save(plan);
        return convertToResponse(updatedPlan);
    }

    @Transactional
    public void sharePlan(SharePlanRequest request, Integer userId) {
        Optional<Plan> planOpt = planRepository.findById(request.getPlanId());
        if (planOpt.isEmpty()) {
            throw new RuntimeException("Plan not found");
        }

        Plan plan = planOpt.get();

        // Only the creator can share the plan
        if (!plan.getCreatedBy().equals(userId)) {
            throw new RuntimeException("Only the plan creator can share the plan");
        }

        // Add sharing records for each user
        for (Integer shareUserId : request.getUserIds()) {
            if (!planSharedRepository.existsByPlanIdAndUserId(request.getPlanId(), shareUserId)) {
                PlanShared planShared = new PlanShared(request.getPlanId(), shareUserId);
                planSharedRepository.save(planShared);
            }
        }
    }

    public List<PlanResponse> getFuturePlans(Integer userId) {
        List<Plan> plans = planRepository.findFuturePlansByUser(userId, LocalDateTime.now());
        return convertToResponseList(plans);
    }

    public List<PlanResponse> getPastPlans(Integer userId) {
        List<Plan> plans = planRepository.findPastPlansByUser(userId, LocalDateTime.now());
        return convertToResponseList(plans);
    }

    public List<PlanResponse> getAllPlansForUser(Integer userId) {
        List<Plan> plans = planRepository.findAllAccessiblePlansForUser(userId);
        return convertToResponseList(plans);
    }

    public PlanResponse getPlanById(Integer planId, Integer userId) {
        Optional<Plan> planOpt = planRepository.findById(planId);
        if (planOpt.isEmpty()) {
            throw new RuntimeException("Plan not found");
        }

        Plan plan = planOpt.get();

        // Check if user has access to this plan
        if (!plan.getCreatedBy().equals(userId) &&
                !planSharedRepository.existsByPlanIdAndUserId(planId, userId)) {
            throw new RuntimeException("Access denied");
        }

        return convertToResponse(plan);
    }

    @Transactional
    public void deletePlan(Integer planId, Integer userId) {
        Optional<Plan> planOpt = planRepository.findById(planId);
        if (planOpt.isEmpty()) {
            throw new RuntimeException("Plan not found");
        }

        Plan plan = planOpt.get();

        // Only the creator can delete the plan
        if (!plan.getCreatedBy().equals(userId)) {
            throw new RuntimeException("Only the plan creator can delete the plan");
        }

        // Remove all sharing records first
        planSharedRepository.deleteByPlanId(planId);

        // Delete the plan
        planRepository.delete(plan);
    }

    private PlanResponse convertToResponse(Plan plan) {
        List<PlanResponse.PlanLocationInfo> locationInfos = new ArrayList<>();

        // Get location details
        if (plan.getLoc1() != null) {
            addLocationInfo(locationInfos, plan.getLoc1());
        }
        if (plan.getLoc2() != null) {
            addLocationInfo(locationInfos, plan.getLoc2());
        }
        if (plan.getLoc3() != null) {
            addLocationInfo(locationInfos, plan.getLoc3());
        }

        // Get shared users
        List<Integer> sharedWith = planSharedRepository.findUserIdsByPlanId(plan.getId());

        return new PlanResponse(
                plan.getId(),
                plan.getDate(),
                plan.getCreatedBy(),
                plan.getCreatedAt(),
                locationInfos,
                sharedWith);
    }

    private void addLocationInfo(List<PlanResponse.PlanLocationInfo> locationInfos, Integer locationId) {
        Optional<Location> locationOpt = locationRepository.findById(locationId);
        if (locationOpt.isPresent()) {
            Location location = locationOpt.get();
            locationInfos.add(new PlanResponse.PlanLocationInfo(
                    location.getId(),
                    location.getName(),
                    location.getAddress(),
                    null // You may want to store scheduled times separately
            ));
        }
    }

    private List<PlanResponse> convertToResponseList(List<Plan> plans) {
        List<PlanResponse> responses = new ArrayList<>();
        for (Plan plan : plans) {
            responses.add(convertToResponse(plan));
        }
        return responses;
    }
}