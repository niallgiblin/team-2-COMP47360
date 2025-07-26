package com.manhattan.busyness_predictor.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.context.request.RequestAttributes;

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

    /**
     * Retrieves the currently authenticated user.
     * First tries SecurityContextHolder, then falls back to the HTTP session if necessary.
     */
    private UserPrincipal getCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            // Fallback to session-based SecurityContext
            RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
            if (attrs instanceof ServletRequestAttributes) {
                HttpServletRequest req = ((ServletRequestAttributes) attrs).getRequest();
                HttpSession session = req.getSession(false);
                if (session != null) {
                    Object contextObj = session.getAttribute(
                        HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY
                    );
                    if (contextObj instanceof SecurityContext) {
                        auth = ((SecurityContext) contextObj).getAuthentication();
                    }
                }
            }
        }
        if (auth == null || auth.getPrincipal() == null) {
            throw new IllegalStateException("Unable to retrieve current user. Please ensure you are logged in.");
        }
        return (UserPrincipal) auth.getPrincipal();
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createPlan(@RequestBody CreatePlanRequest request) {
        UserPrincipal currentUser = getCurrentUser();
        PlanResponse planResponse = planService.createPlan(request, currentUser.getId());

        Map<String, Object> body = new HashMap<>();
        body.put("message", "Plan created successfully");
        body.put("plan", planResponse);
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getAllPlans() {
        UserPrincipal currentUser = getCurrentUser();
        List<PlanResponse> plans = planService.getAllPlansForUser(currentUser.getId());

        Map<String, Object> body = new HashMap<>();
        body.put("plans", plans);
        body.put("count", plans.size());
        return ResponseEntity.ok(body);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getPlanById(@PathVariable Integer id) {
        UserPrincipal currentUser = getCurrentUser();
        PlanResponse planResponse = planService.getPlanById(id, currentUser.getId());

        Map<String, Object> body = new HashMap<>();
        body.put("plan", planResponse);
        return ResponseEntity.ok(body);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deletePlan(@PathVariable Integer id) {
        UserPrincipal currentUser = getCurrentUser();
        planService.deletePlan(id, currentUser.getId());

        Map<String, Object> body = new HashMap<>();
        body.put("message", "Plan deleted successfully");
        return ResponseEntity.ok(body);
    }

    @PostMapping("/share")
    public ResponseEntity<Map<String, Object>> sharePlan(@RequestBody SharePlanRequest request) {
        UserPrincipal currentUser = getCurrentUser();
        planService.sharePlan(request.getPlanId(), currentUser.getId(), request.getUserIds());

        Map<String, Object> body = new HashMap<>();
        body.put("message", "Plan shared successfully");
        return ResponseEntity.ok(body);
    }

    @GetMapping("/shared-with-me")
    public ResponseEntity<Map<String, Object>> getPlansSharedWithMe() {
        UserPrincipal currentUser = getCurrentUser();
        List<SharedPlanResponse> sharedPlans =
            planService.getPlansSharedWithUser(currentUser.getId());

        Map<String, Object> body = new HashMap<>();
        body.put("sharedPlans", sharedPlans);
        body.put("count", sharedPlans.size());
        return ResponseEntity.ok(body);
    }
}
