package com.manhattan.busyness_predictor.service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.manhattan.busyness_predictor.dto.CreatePlanRequest;
import com.manhattan.busyness_predictor.dto.LocationDto;
import com.manhattan.busyness_predictor.dto.PlanResponse;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.Plan;
import com.manhattan.busyness_predictor.model.PlanVenue;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import com.manhattan.busyness_predictor.repository.PlanRepository;
import com.manhattan.busyness_predictor.repository.PlanVenueRepository;
import com.manhattan.busyness_predictor.repository.UserRepository;

/**
 * Service class responsible for handling user plan operations initiated by the frontend.
 */
@Service
public class PlanService {

    @Autowired
    private PlanRepository planRepository;

    @Autowired
    private PlanVenueRepository planVenueRepository;

    @Autowired
    private LocationRepository locationRepository;

    @Autowired
    private UserRepository userRepository;

    /**
     * Creates a new plan for the given user.
     *
     * @param request Details including the plan name and a list of location IDs
     * @param userId  Identifier of the user who owns this plan
     * @return        A PlanResponse DTO representing the saved plan
     */
    @Transactional
    public PlanResponse createPlan(CreatePlanRequest request, Integer userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found with ID: " + userId));

        // Ensure the requested locations exist
        List<Location> venues = locationRepository.findAllById(request.getLocationIds());
        if (venues.size() != request.getLocationIds().size()) {
            throw new RuntimeException("One or more venues were not found");
        }

        // Build and persist the Plan entity
        Plan plan = new Plan();
        plan.setName(request.getName());
        plan.setCreatedBy(user);
        Plan savedPlan = planRepository.save(plan);

        // Link each venue to the plan in the specified order
        List<PlanVenue> planVenues = new ArrayList<>();
        List<Integer> requestedIds = request.getLocationIds();
        for (int i = 0; i < requestedIds.size(); i++) {
            Integer locId = requestedIds.get(i);
            // Find the location from the pre-fetched list to maintain order and avoid extra queries
            Location venue = venues.stream()
                .filter(v -> v.getId().equals(locId))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("A requested location was not found in the pre-fetched list. This should not happen."));

            PlanVenue planVenue = new PlanVenue();
            planVenue.setPlan(savedPlan);
            planVenue.setLocation(venue);
            planVenue.setOrderIndex(i);
            planVenues.add(planVenue);
        }
        
        // Batch save all PlanVenue objects
        planVenueRepository.saveAll(planVenues);
        savedPlan.setVenues(planVenues); // Set venues on the plan object for the response conversion

        return convertToResponse(savedPlan);
    }

    /**
     * Retrieves all plans created by the specified user, ordered by creation date descending.
     *
     * @param userId Identifier of the user
     * @return       A list of PlanResponse DTOs
     */
    public List<PlanResponse> getAllPlansForUser(Integer userId) {
        List<Plan> plans = planRepository.findByCreatedBy_IdOrderByCreatedAtDesc(userId);
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
        Plan plan = planRepository.findByIdAndCreatedBy_Id(planId, userId)
                .orElseThrow(() -> new RuntimeException("Plan not found or access denied"));
        return convertToResponse(plan);
    }

    /**
     * Deletes a plan along with its associated venue links for the specified user.
     *
     * @param planId ID of the plan to delete
     * @param userId ID of the user requesting deletion
     */
    @Transactional
    public void deletePlan(Integer planId, Integer userId) {
        Plan plan = planRepository.findByIdAndCreatedBy_Id(planId, userId)
                .orElseThrow(() -> new RuntimeException("Plan not found or access denied"));

        // Deleting the plan will cascade to PlanVenue entries due to CascadeType.ALL
        planRepository.delete(plan);
    }

    /**
     * Converts a Plan entity into a PlanResponse DTO for API output.
     *
     * @param plan The entity to convert
     * @return     The corresponding PlanResponse DTO
     */
    private PlanResponse convertToResponse(Plan plan) {
        List<LocationDto> venueDtos = new ArrayList<>();

        if (plan.getVenues() != null) {
            venueDtos = plan.getVenues().stream()
                .sorted((a, b) -> a.getOrderIndex().compareTo(b.getOrderIndex()))
                .map(planVenue -> LocationDto.fromLocation(planVenue.getLocation()))
                .collect(Collectors.toList());
        }

        return new PlanResponse(plan.getId(), plan.getName(), plan.getCreatedAt(), venueDtos);
    }

    /**
     * Converts a list of Plan entities to a list of PlanResponse DTOs.
     *
     * @param plans The list of entities
     * @return      The list of DTOs
     */
    private List<PlanResponse> convertToResponseList(List<Plan> plans) {
        return plans.stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());
    }
}
