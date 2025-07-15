package com.manhattan.busyness_predictor.dto;

public class SharedPlanResponse {
    private PlanResponse plan;
    private UserDto sharedBy;

    public SharedPlanResponse() {}

    public SharedPlanResponse(PlanResponse plan, UserDto sharedBy) {
        this.plan = plan;
        this.sharedBy = sharedBy;
    }

    public PlanResponse getPlan() {
        return plan;
    }

    public void setPlan(PlanResponse plan) {
        this.plan = plan;
    }

    public UserDto getSharedBy() {
        return sharedBy;
    }

    public void setSharedBy(UserDto sharedBy) {
        this.sharedBy = sharedBy;
    }
} 