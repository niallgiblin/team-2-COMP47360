package com.manhattan.busyness_predictor.service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.manhattan.busyness_predictor.dto.CreatePlanRequest;
import com.manhattan.busyness_predictor.dto.PlanResponse;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.Plan;
import com.manhattan.busyness_predictor.model.PlanVenue;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import com.manhattan.busyness_predictor.repository.PlanRepository;
import com.manhattan.busyness_predictor.repository.PlanVenueRepository;

/**
 * Service class responsible for handling user plan operations initiated by the frontend.
 */
@Service
public class FrontendPlanService {

    @Autowired
    private PlanRepository planRepository;

    @Autowired
    private PlanVenueRepository planVenueRepository;

    @Autowired
    private LocationRepository locationRepository;

    /**
     * Creates a new plan for the given user.
     *
     * @param request Details including the plan name and a list of location IDs
     * @param userId  Identifier of the user who owns this plan
     * @return        A PlanResponse DTO representing the saved plan
     */
    @Transactional
    public PlanResponse createPlan(CreatePlanRequest request, Integer userId) {
        // Ensure the requested locations exist
        List<Location> venues = locationRepository.findAllById(request.getLocationIds());
        if (venues.size() != request.getLocationIds().size()) {
            throw new RuntimeException("One or more venues were not found");
        }

        // Build and persist the Plan entity
        Plan plan = new Plan();
        plan.setName(request.getName());
        plan.setCreatedBy(userId);
        plan.setCreatedAt(LocalDateTime.now());
        Plan savedPlan = planRepository.save(plan);

        // Link each venue to the plan in the specified order
        for (int i = 0; i < request.getLocationIds().size(); i++) {
            Integer locId = request.getLocationIds().get(i);
            Location venue = venues.stream()
                .filter(v -> v.getId().equals(locId))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("Venue not found: " + locId));

            PlanVenue planVenue = new PlanVenue();
            planVenue.setPlan(savedPlan);
            planVenue.setLocation(venue);
            planVenue.setOrderIndex(i);
            planVenueRepository.save(planVenue);
        }

        return convertToResponse(savedPlan);
    }

    /**
     * Retrieves all plans created by the specified user, ordered by creation date descending.
     *
     * @param userId Identifier of the user
     * @return       A list of PlanResponse DTOs
     */
    public List<PlanResponse> getAllPlansForUser(Integer userId) {
        List<Plan> plans = planRepository.findByCreatedByOrderByCreatedAtDesc(userId);
        return convertToResponseList(plans);
    }

    /**
     * Retrieves a specific plan by ID, ensuring the user owns the plan.
     *
     * @param planId The ID of the plan
     * @param userId The ID of the user requesting the plan
     * @return       A PlanResponse DTO
     */
    public PlanResponse getPlanById(Integer planId, Integer userId) {
        Optional<Plan> opt = planRepository.findByIdAndCreatedBy(planId, userId);
        if (opt.isEmpty()) {
            throw new RuntimeException("Plan not found or access denied");
        }
        return convertToResponse(opt.get());
    }

    /**
     * Deletes a plan along with its associated venue links for the specified user.
     *
     * @param planId ID of the plan to delete
     * @param userId ID of the user requesting deletion
     */
    @Transactional
    public void deletePlan(Integer planId, Integer userId) {
        Optional<Plan> opt = planRepository.findByIdAndCreatedBy(planId, userId);
        if (opt.isEmpty()) {
            throw new RuntimeException("Plan not found or access denied");
        }

        // Remove linked venues first
        planVenueRepository.deleteByPlanId(planId);
        // Then delete the plan entity
        planRepository.delete(opt.get());
    }

    /**
     * Converts a Plan entity into a PlanResponse DTO for API output.
     *
     * @param plan The entity to convert
     * @return     The corresponding PlanResponse DTO
     */
    private PlanResponse convertToResponse(Plan plan) {
        List<PlanResponse.VenueInfo> infoList = new ArrayList<>();

        if (plan.getVenues() != null) {
            plan.getVenues().stream()
                .sorted((a, b) -> a.getOrderIndex().compareTo(b.getOrderIndex()))
                .forEach(pv -> {
                    Location loc = pv.getLocation();
                    PlanResponse.VenueInfo info = new PlanResponse.VenueInfo(
                        loc.getId(), loc.getName(), loc.getAddress(), loc.getUri(),
                        loc.getLat(), loc.getLng(), loc.getReview(), loc.getNumReviews(),
                        loc.getIsRestaurant(), loc.getIsLandmark(), loc.getIsClub(),
                        loc.getIsBar(), loc.getDescription(), loc.getPrice(), loc.getZone());
                    infoList.add(info);
                });
        }

        return new PlanResponse(plan.getId(), plan.getName(), plan.getCreatedAt(), infoList);
    }

    /**
     * Converts a list of Plan entities to a list of PlanResponse DTOs.
     *
     * @param plans The list of entities
     * @return      The list of DTOs
     */
    private List<PlanResponse> convertToResponseList(List<Plan> plans) {
        List<PlanResponse> responses = new ArrayList<>();
        for (Plan plan : plans) {
            responses.add(convertToResponse(plan));
        }
        return responses;
    }
}
