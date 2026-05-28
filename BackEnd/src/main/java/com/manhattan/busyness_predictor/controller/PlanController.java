package com.manhattan.busyness_predictor.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.manhattan.busyness_predictor.dto.CreatePlanRequest;
import com.manhattan.busyness_predictor.dto.PlanResponse;
import com.manhattan.busyness_predictor.dto.SharePlanRequest;
import com.manhattan.busyness_predictor.dto.SharedPlanResponse;
import com.manhattan.busyness_predictor.security.UserPrincipal;
import com.manhattan.busyness_predictor.service.PlanService;

@RestController
@RequestMapping("/api/plans")
public class PlanController {

    @Autowired
    private PlanService planService;

    @PostMapping
    public ResponseEntity<Map<String, Object>> createPlan(
            @RequestBody CreatePlanRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        PlanResponse planResponse = planService.createPlan(request, currentUser.getId());

        Map<String, Object> body = new HashMap<>();
        body.put("message", "Plan created successfully");
        body.put("plan", planResponse);
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getAllPlans(
            @AuthenticationPrincipal UserPrincipal currentUser) {
        List<PlanResponse> plans = planService.getAllPlansForUser(currentUser.getId());

        Map<String, Object> body = new HashMap<>();
        body.put("plans", plans);
        body.put("count", plans.size());
        return ResponseEntity.ok(body);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getPlanById(
            @PathVariable Integer id,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        PlanResponse planResponse = planService.getPlanById(id, currentUser.getId());

        Map<String, Object> body = new HashMap<>();
        body.put("plan", planResponse);
        return ResponseEntity.ok(body);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deletePlan(
            @PathVariable Integer id,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        planService.deletePlan(id, currentUser.getId());

        Map<String, Object> body = new HashMap<>();
        body.put("message", "Plan deleted successfully");
        return ResponseEntity.ok(body);
    }

    @PostMapping("/share")
    public ResponseEntity<Map<String, Object>> sharePlan(
            @RequestBody SharePlanRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        planService.sharePlan(request.getPlanId(), currentUser.getId(), request.getUserIds());

        Map<String, Object> body = new HashMap<>();
        body.put("message", "Plan shared successfully");
        return ResponseEntity.ok(body);
    }

    @GetMapping("/shared-with-me")
    public ResponseEntity<Map<String, Object>> getPlansSharedWithMe(
            @AuthenticationPrincipal UserPrincipal currentUser) {
        List<SharedPlanResponse> sharedPlans =
            planService.getPlansSharedWithUser(currentUser.getId());

        Map<String, Object> body = new HashMap<>();
        body.put("sharedPlans", sharedPlans);
        body.put("count", sharedPlans.size());
        return ResponseEntity.ok(body);
    }
}
