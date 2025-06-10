package com.manhattan.busyness_predictor.dto;

import java.util.List;

public class SharePlanRequest {
    private Integer planId;
    private List<Integer> userIds;

    public SharePlanRequest() {
    }

    public SharePlanRequest(Integer planId, List<Integer> userIds) {
        this.planId = planId;
        this.userIds = userIds;
    }

    // Getters and Setters
    public Integer getPlanId() {
        return planId;
    }

    public void setPlanId(Integer planId) {
        this.planId = planId;
    }

    public List<Integer> getUserIds() {
        return userIds;
    }

    public void setUserIds(List<Integer> userIds) {
        this.userIds = userIds;
    }
}