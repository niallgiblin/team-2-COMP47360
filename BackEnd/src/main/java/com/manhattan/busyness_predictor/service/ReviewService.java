package com.manhattan.busyness_predictor.service;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.manhattan.busyness_predictor.dto.ReviewRequest;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.Review;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import com.manhattan.busyness_predictor.repository.ReviewRepository;
import com.manhattan.busyness_predictor.repository.UserRepository;

@Service
public class ReviewService {

    @Autowired
    private ReviewRepository reviewRepository;

    @Autowired
    private LocationRepository locationRepository;

    @Autowired
    private UserRepository userRepository;

    @Transactional
    public Review createReview(Integer userId, Integer locationId, ReviewRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        Location location = locationRepository.findById(locationId)
                .orElseThrow(() -> new RuntimeException("Location not found"));
        // Check if user already reviewed this location
        if (reviewRepository.existsByUserAndLocation(user, location)) {
            throw new RuntimeException("You have already reviewed this location");
        }

        // Create review
        Review review = new Review(user, location, request.getReviewText(), request.getReviewVal());
        review = reviewRepository.save(review);

        // Update location's average rating and review count
        updateLocationRating(location);

        return review;
    }

    @Transactional
    public Review updateReview(Integer reviewId, Integer userId, ReviewRequest request) {
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new RuntimeException("Review not found"));

        // Check if user owns this review
        if (!review.getUser().getId().equals(userId)) {
            throw new RuntimeException("You can only update your own reviews");
        }

        // Update review
        review.setReviewText(request.getReviewText());
        review.setReviewVal(request.getReviewVal());
        review = reviewRepository.save(review);

        // Update location's average rating
        updateLocationRating(review.getLocation());

        return review;
    }

    public List<Review> getLocationReviews(Integer locationId) {
        Location location = locationRepository.findById(locationId)
                .orElseThrow(() -> new RuntimeException("Location not found"));
        return reviewRepository.findByLocationOrderByTimestampDesc(location);
    }

    public List<Review> getUserReviews(Integer userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        return reviewRepository.findByUserOrderByTimestampDesc(user);
    }

    private void updateLocationRating(Location location) {
        List<Review> reviews = reviewRepository.findByLocation(location);

        if (!reviews.isEmpty()) {
            double averageRating = reviews.stream()
                    .mapToDouble(Review::getReviewVal)
                    .average()
                    .orElse(0.0);

            location.setReview((float) averageRating);
            location.setNumReviews(reviews.size());
            locationRepository.save(location);
        } else {
            location.setReview(0f);
            location.setNumReviews(0);
            locationRepository.save(location);
        }
    }
}
