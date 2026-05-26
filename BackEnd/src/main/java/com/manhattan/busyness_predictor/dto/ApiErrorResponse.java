package com.manhattan.busyness_predictor.dto;

public class ApiErrorResponse {

    private final String error;
    private final String message;
    private final int status;
    private final String code;

    public ApiErrorResponse(String error, String message, int status, String code) {
        this.error = error;
        this.message = message;
        this.status = status;
        this.code = code;
    }

    public static ApiErrorResponse of(String error, String message, int status, String code) {
        return new ApiErrorResponse(error, message, status, code);
    }

    public String getError() {
        return error;
    }

    public String getMessage() {
        return message;
    }

    public int getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
