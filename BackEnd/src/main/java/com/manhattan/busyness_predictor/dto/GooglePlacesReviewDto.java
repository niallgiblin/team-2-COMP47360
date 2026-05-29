package com.manhattan.busyness_predictor.dto;

import java.util.List;

/**
 * DTO for Google Places API review responses.
 */
public class GooglePlacesReviewDto {

    private String placeId;
    private String placeName;
    private Double googleRating;
    private Integer totalRatings;
    private List<ReviewEntry> reviews;
    private String attribution;
    private String error;

    public static class ReviewEntry {
        private String authorName;
        private String profilePhotoUrl;
        private Double rating;
        private String text;
        private Long time; // Unix timestamp in seconds
        private String relativeTimeDescription;

        public String getAuthorName() { return authorName; }
        public void setAuthorName(String authorName) { this.authorName = authorName; }

        public String getProfilePhotoUrl() { return profilePhotoUrl; }
        public void setProfilePhotoUrl(String profilePhotoUrl) { this.profilePhotoUrl = profilePhotoUrl; }

        public Double getRating() { return rating; }
        public void setRating(Double rating) { this.rating = rating; }

        public String getText() { return text; }
        public void setText(String text) { this.text = text; }

        public Long getTime() { return time; }
        public void setTime(Long time) { this.time = time; }

        public String getRelativeTimeDescription() { return relativeTimeDescription; }
        public void setRelativeTimeDescription(String relativeTimeDescription) {
            this.relativeTimeDescription = relativeTimeDescription;
        }
    }

    public String getPlaceId() { return placeId; }
    public void setPlaceId(String placeId) { this.placeId = placeId; }

    public String getPlaceName() { return placeName; }
    public void setPlaceName(String placeName) { this.placeName = placeName; }

    public Double getGoogleRating() { return googleRating; }
    public void setGoogleRating(Double googleRating) { this.googleRating = googleRating; }

    public Integer getTotalRatings() { return totalRatings; }
    public void setTotalRatings(Integer totalRatings) { this.totalRatings = totalRatings; }

    public List<ReviewEntry> getReviews() { return reviews; }
    public void setReviews(List<ReviewEntry> reviews) { this.reviews = reviews; }

    public String getAttribution() { return attribution; }
    public void setAttribution(String attribution) { this.attribution = attribution; }

    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
}
