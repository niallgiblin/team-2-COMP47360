package com.manhattan.busyness_predictor.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.manhattan.busyness_predictor.dto.AddPlaceToPlanRequest;
import com.manhattan.busyness_predictor.dto.CreatePlanRequest;
import com.manhattan.busyness_predictor.dto.ErrorResponse;
import com.manhattan.busyness_predictor.dto.PlanResponse;
import com.manhattan.busyness_predictor.dto.SharePlanRequest;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.service.PlanService;

@RestController
@RequestMapping("/api/plan")
@CrossOrigin(origins = "*")
public class PlanController {

    @Autowired
    private PlanService planService;

    @PostMapping("/create")
    public ResponseEntity<?> createPlan(@RequestBody CreatePlanRequest request, @RequestAttribute User user) {
        try {
            PlanResponse response = planService.createPlan(request, user.getId());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(new ErrorResponse(false, e.getMessage()));
        }
    }

    @PostMapping("/add-place")
    public ResponseEntity<?> addPlaceToPlan(@RequestBody AddPlaceToPlanRequest request, @RequestAttribute User user) {
        try {
            PlanResponse response = planService.addPlaceToPlan(request, user.getId());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(new ErrorResponse(false, e.getMessage()));
        }
    }

    @PostMapping("/share")
    public ResponseEntity<?> sharePlan(@RequestBody SharePlanRequest request, @RequestAttribute User user) {
        try {
            planService.sharePlan(request, user.getId());
            return ResponseEntity.ok(new ErrorResponse(true, "Plan shared successfully"));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(new ErrorResponse(false, e.getMessage()));
        }
    }

    @GetMapping("/future")
    public ResponseEntity<?> getFuturePlans(@RequestAttribute User user) {
        try {
            List<PlanResponse> plans = planService.getFuturePlans(user.getId());
            return ResponseEntity.ok(plans);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ErrorResponse(false, e.getMessage()));
        }
    }

    @GetMapping("/past")
    public ResponseEntity<?> getPastPlans(@RequestAttribute User user) {
        try {
            List<PlanResponse> plans = planService.getPastPlans(user.getId());
            return ResponseEntity.ok(plans);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ErrorResponse(false, e.getMessage()));
        }
    }

    @GetMapping("/all")
    public ResponseEntity<?> getAllPlans(@RequestAttribute User user) {
        try {
            List<PlanResponse> plans = planService.getAllPlansForUser(user.getId());
            return ResponseEntity.ok(plans);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ErrorResponse(false, e.getMessage()));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getPlanById(@PathVariable Integer planId, @RequestAttribute User user) {
        try {
            PlanResponse plan = planService.getPlanById(planId, user.getId());
            return ResponseEntity.ok(plan);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new ErrorResponse(false, e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deletePlan(@PathVariable Integer planId, @RequestAttribute User user) {
        try {
            planService.deletePlan(planId, user.getId());
            return ResponseEntity.ok(new ErrorResponse(true, "Plan deleted successfully"));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(new ErrorResponse(false, e.getMessage()));
        }
    }
}