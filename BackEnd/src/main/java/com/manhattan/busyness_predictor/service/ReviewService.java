package com.manhattan.busyness_predictor.service;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.manhattan.busyness_predictor.dto.ReviewRequest;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.Review;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import com.manhattan.busyness_predictor.repository.ReviewRepository;

@Service
public class ReviewService {

    @Autowired
    private ReviewRepository reviewRepository;

    @Autowired
    private LocationRepository locationRepository;

    @Transactional
    public Review createReview(Integer userId, Integer locationId, ReviewRequest request) {
        // Check if location exists
        locationRepository.findById(locationId)
                .orElseThrow(() -> new RuntimeException("Location not found"));
        // Check if user already reviewed this location
        if (reviewRepository.existsByUserIdAndLocationId(userId, locationId)) {
            throw new RuntimeException("You have already reviewed this location");
        }

        // Create review
        Review review = new Review(userId, locationId, request.getReviewText(), request.getReviewVal());
        review = reviewRepository.save(review);

        // Update location's average rating and review count
        updateLocationRating(locationId);

        return review;
    }

    @Transactional
    public Review updateReview(Integer reviewId, Integer userId, ReviewRequest request) {
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new RuntimeException("Review not found"));

        // Check if user owns this review
        if (!review.getUserId().equals(userId)) {
            throw new RuntimeException("You can only update your own reviews");
        }

        // Update review
        review.setReviewText(request.getReviewText());
        review.setReviewVal(request.getReviewVal());
        review = reviewRepository.save(review);

        // Update location's average rating
        updateLocationRating(review.getLocationId());

        return review;
    }

    public List<Review> getLocationReviews(Integer locationId) {
        return reviewRepository.findByLocationIdOrderByTimestampDesc(locationId);
    }

    public List<Review> getUserReviews(Integer userId) {
        return reviewRepository.findByUserIdOrderByTimestampDesc(userId);
    }

    private void updateLocationRating(Integer locationId) {
        List<Review> reviews = reviewRepository.findByLocationId(locationId);

        if (!reviews.isEmpty()) {
            double averageRating = reviews.stream()
                    .mapToDouble(Review::getReviewVal)
                    .average()
                    .orElse(0.0);

            Location location = locationRepository.findById(locationId).orElse(null);
            if (location != null) {
                location.setReview((float) averageRating);
                location.setNumReviews(reviews.size());
                locationRepository.save(location);
            }
        }
    }
}
