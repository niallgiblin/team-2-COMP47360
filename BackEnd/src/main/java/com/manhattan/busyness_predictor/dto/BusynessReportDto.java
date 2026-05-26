package com.manhattan.busyness_predictor.dto;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class BusynessReportDto {

    private boolean success;
    private Map<String, Double> predictions;
    private List<Object> forecast;
    private boolean cached;

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public Map<String, Double> getPredictions() {
        return predictions;
    }

    public void setPredictions(Map<String, Double> predictions) {
        this.predictions = predictions;
    }

    public List<Object> getForecast() {
        return forecast;
    }

    public void setForecast(List<Object> forecast) {
        this.forecast = forecast;
    }

    public boolean isCached() {
        return cached;
    }

    public void setCached(boolean cached) {
        this.cached = cached;
    }
}
