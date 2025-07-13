package com.manhattan.busyness_predictor.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.manhattan.busyness_predictor.dto.AddFriendRequest;
import com.manhattan.busyness_predictor.model.Friend;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.UserRepository;
import com.manhattan.busyness_predictor.service.FriendService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/friends")
public class FriendController {

    @Autowired
    private FriendService friendService;
    
    @Autowired
    private UserRepository userRepository;

    // Add friend by username
    @PostMapping("/add")
    public ResponseEntity<Map<String, Object>> addFriendByUsername(
            @AuthenticationPrincipal UserDetails currentUserDetails,
            @Valid @RequestBody AddFriendRequest request) {
        try {
            User currentUser = userRepository.findByUsername(currentUserDetails.getUsername())
                    .orElseThrow(() -> new RuntimeException("Authenticated user not found"));

            Friend friendship = friendService.addFriendByUsername(currentUser.getId(), request.getUsername());
            
            Map<String, Object> response = new HashMap<>();
            response.put("message", "Friend added successfully");
            response.put("friendship", friendship);
            response.put("friendAddedAt", friendship.getTimestamp());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    // Remove friend
    @DeleteMapping("/remove")
    public ResponseEntity<Map<String, Object>> removeFriend(
            @AuthenticationPrincipal UserDetails currentUserDetails,
            @RequestParam Integer friendId) {
        try {
            User currentUser = userRepository.findByUsername(currentUserDetails.getUsername())
                    .orElseThrow(() -> new RuntimeException("Authenticated user not found"));

            friendService.removeFriend(currentUser.getId(), friendId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("message", "Friend removed successfully");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    // Remove friend by username
    @DeleteMapping("/remove-by-username")
    public ResponseEntity<Map<String, Object>> removeFriendByUsername(
            @AuthenticationPrincipal UserDetails currentUserDetails,
            @RequestParam String username) {
        try {
            User currentUser = userRepository.findByUsername(currentUserDetails.getUsername())
                    .orElseThrow(() -> new RuntimeException("Authenticated user not found"));

            friendService.removeFriendByUsername(currentUser.getId(), username);
            
            Map<String, Object> response = new HashMap<>();
            response.put("message", "Friend removed successfully");
            response.put("removedUsername", username);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    // Get user's friends list
    @GetMapping("/list")
    public ResponseEntity<Map<String, Object>> getFriendsList(@AuthenticationPrincipal UserDetails currentUserDetails) {
        try {
            User currentUser = userRepository.findByUsername(currentUserDetails.getUsername()).orElseThrow(() -> new RuntimeException("Authenticated user not found"));

            List<User> acceptedFriends = friendService.getFriendsByStatus(currentUser.getId(), Friend.FriendStatus.ACCEPTED);
            List<User> sentRequests = friendService.getSentRequests(currentUser.getId());
            List<User> receivedRequests = friendService.getReceivedRequests(currentUser.getId());

            Map<String, Object> response = new HashMap<>();
            response.put("accepted", acceptedFriends);
            response.put("sent", sentRequests);
            response.put("received", receivedRequests);
            response.put("totalFriends", acceptedFriends.size());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @PostMapping("/accept/{requesterId}")
    public ResponseEntity<Map<String, Object>> acceptFriendRequest(
            @AuthenticationPrincipal UserDetails currentUserDetails,
            @PathVariable Integer requesterId) {
        try {
            User currentUser = userRepository.findByUsername(currentUserDetails.getUsername()).orElseThrow(() -> new RuntimeException("Authenticated user not found"));
            friendService.acceptFriendRequest(currentUser.getId(), requesterId);

            Map<String, Object> response = new HashMap<>();
            response.put("message", "Friend request accepted");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @PostMapping("/decline/{requesterId}")
    public ResponseEntity<Map<String, Object>> declineFriendRequest(
            @AuthenticationPrincipal UserDetails currentUserDetails,
            @PathVariable Integer requesterId) {
        try {
            User currentUser = userRepository.findByUsername(currentUserDetails.getUsername()).orElseThrow(() -> new RuntimeException("Authenticated user not found"));
            friendService.declineFriendRequest(currentUser.getId(), requesterId);

            Map<String, Object> response = new HashMap<>();
            response.put("message", "Friend request declined");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    // Search users by username (for adding friends)
    @GetMapping("/search")
    public ResponseEntity<Map<String, Object>> searchUsers(
            @RequestParam String query,
            @AuthenticationPrincipal UserDetails currentUserDetails) {
        try {
            User currentUser = userRepository.findByUsername(currentUserDetails.getUsername())
                    .orElseThrow(() -> new RuntimeException("Authenticated user not found"));
            
            List<User> users = friendService.searchUsersByUsername(query, currentUser.getId());

            Map<String, Object> response = new HashMap<>();
            response.put("users", users);
            response.put("totalResults", users.size());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    // Check if two users are friends
    @GetMapping("/check")
    public ResponseEntity<Map<String, Object>> checkFriendship(
            @AuthenticationPrincipal UserDetails currentUserDetails,
            @RequestParam Integer otherUserId) {
        try {
            User currentUser = userRepository.findByUsername(currentUserDetails.getUsername())
                    .orElseThrow(() -> new RuntimeException("Authenticated user not found"));

            boolean areFriends = friendService.areFriends(currentUser.getId(), otherUserId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("areFriends", areFriends);
            response.put("userId", currentUser.getId());
            response.put("otherUserId", otherUserId);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    // Get friend count
    @GetMapping("/count")
    public ResponseEntity<Map<String, Object>> getFriendCount(@AuthenticationPrincipal UserDetails currentUserDetails) {
        try {
            User currentUser = userRepository.findByUsername(currentUserDetails.getUsername())
                    .orElseThrow(() -> new RuntimeException("Authenticated user not found"));

            Integer friendCount = friendService.getFriendCount(currentUser.getId());
            
            Map<String, Object> response = new HashMap<>();
            response.put("userId", currentUser.getId());
            response.put("friendCount", friendCount);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    // Get mutual friends between two users
    @GetMapping("/mutual")
    public ResponseEntity<Map<String, Object>> getMutualFriends(
            @AuthenticationPrincipal UserDetails currentUserDetails,
            @RequestParam Integer otherUserId) {
        try {
            User currentUser = userRepository.findByUsername(currentUserDetails.getUsername())
                    .orElseThrow(() -> new RuntimeException("Authenticated user not found"));

            List<User> mutualFriends = friendService.getMutualFriends(currentUser.getId(), otherUserId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("mutualFriends", mutualFriends);
            response.put("totalMutual", mutualFriends.size());
            response.put("userId", currentUser.getId());
            response.put("otherUserId", otherUserId);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }
}