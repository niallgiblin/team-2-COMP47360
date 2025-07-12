package com.manhattan.busyness_predictor.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.manhattan.busyness_predictor.dto.CreatePlanRequest;
import com.manhattan.busyness_predictor.dto.PlanResponse;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.service.FrontendPlanService;

/**
 * REST controller for handling plan-related endpoints called by the frontend.
 */
@RestController
@RequestMapping("/api/plans")
@CrossOrigin(origins = "*")
public class FrontendPlanController {

    @Autowired
    private FrontendPlanService frontendPlanService;

    /**
     * Creates a new plan for the authenticated user.
     *
     * @param request  the payload containing plan name and location IDs
     * @param user     the authenticated user from the request context
     * @return a ResponseEntity with a success message and the created plan, or an error message on failure
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> createPlan(
            @RequestBody CreatePlanRequest request,
            @RequestAttribute User user) {
        try {
            PlanResponse planResponse = frontendPlanService.createPlan(request, user.getId());

            Map<String, Object> responseBody = new HashMap<>();
            responseBody.put("message", "Plan created successfully");
            responseBody.put("plan", planResponse);

            return ResponseEntity.ok(responseBody);
        } catch (Exception ex) {
            Map<String, Object> errorBody = new HashMap<>();
            errorBody.put("error", ex.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(errorBody);
        }
    }

    /**
     * Retrieves all plans belonging to the authenticated user.
     *
     * @param user the authenticated user from the request context
     * @return a ResponseEntity with a list of plans and a count, or an error message on failure
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> getAllPlans(
            @RequestAttribute User user) {
        try {
            List<PlanResponse> plans = frontendPlanService.getAllPlansForUser(user.getId());

            Map<String, Object> responseBody = new HashMap<>();
            responseBody.put("plans", plans);
            responseBody.put("count", plans.size());

            return ResponseEntity.ok(responseBody);
        } catch (Exception ex) {
            Map<String, Object> errorBody = new HashMap<>();
            errorBody.put("error", ex.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorBody);
        }
    }

    /**
     * Retrieves a specific plan by its ID for the authenticated user.
     *
     * @param id   the ID of the plan to retrieve
     * @param user the authenticated user from the request context
     * @return a ResponseEntity with the requested plan, or an error message if not found or unauthorized
     */
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getPlanById(
            @PathVariable Integer id,
            @RequestAttribute User user) {
        try {
            PlanResponse planResponse = frontendPlanService.getPlanById(id, user.getId());

            Map<String, Object> responseBody = new HashMap<>();
            responseBody.put("plan", planResponse);

            return ResponseEntity.ok(responseBody);
        } catch (Exception ex) {
            Map<String, Object> errorBody = new HashMap<>();
            errorBody.put("error", ex.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorBody);
        }
    }

    /**
     * Deletes a plan by its ID for the authenticated user.
     *
     * @param id   the ID of the plan to delete
     * @param user the authenticated user from the request context
     * @return a ResponseEntity with a success message or an error message on failure
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deletePlan(
            @PathVariable Integer id,
            @RequestAttribute User user) {
        try {
            frontendPlanService.deletePlan(id, user.getId());

            Map<String, Object> responseBody = new HashMap<>();
            responseBody.put("message", "Plan deleted successfully");

            return ResponseEntity.ok(responseBody);
        } catch (Exception ex) {
            Map<String, Object> errorBody = new HashMap<>();
            errorBody.put("error", ex.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(errorBody);
        }
    }
}
