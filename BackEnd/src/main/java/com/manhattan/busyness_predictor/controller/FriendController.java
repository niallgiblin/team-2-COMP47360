package com.manhattan.busyness_predictor.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.manhattan.busyness_predictor.dto.AddFriendRequest;
import com.manhattan.busyness_predictor.model.Friend;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.service.FriendService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/friends")
public class FriendController {

    @Autowired
    private FriendService friendService;

    // Add friend by username
    @PostMapping("/add")
    public ResponseEntity<Map<String, Object>> addFriendByUsername(
            @RequestParam Integer userId,
            @Valid @RequestBody AddFriendRequest request) {
        try {
            Friend friendship = friendService.addFriendByUsername(userId, request.getUsername());
            
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
            @RequestParam Integer userId,
            @RequestParam Integer friendId) {
        try {
            friendService.removeFriend(userId, friendId);
            
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
            @RequestParam Integer userId,
            @RequestParam String username) {
        try {
            friendService.removeFriendByUsername(userId, username);
            
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
    public ResponseEntity<Map<String, Object>> getFriendsList(@RequestParam Integer userId) {
        try {
            List<User> friends = friendService.getFriendsList(userId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("friends", friends);
            response.put("totalFriends", friends.size());
            
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
            @RequestParam Integer currentUserId) {
        try {
            List<User> users = friendService.searchUsersByUsername(query, currentUserId);
            
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
            @RequestParam Integer userId,
            @RequestParam Integer otherUserId) {
        try {
            boolean areFriends = friendService.areFriends(userId, otherUserId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("areFriends", areFriends);
            response.put("userId", userId);
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
    public ResponseEntity<Map<String, Object>> getFriendCount(@RequestParam Integer userId) {
        try {
            Integer friendCount = friendService.getFriendCount(userId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("userId", userId);
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
            @RequestParam Integer userId,
            @RequestParam Integer otherUserId) {
        try {
            List<User> mutualFriends = friendService.getMutualFriends(userId, otherUserId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("mutualFriends", mutualFriends);
            response.put("totalMutual", mutualFriends.size());
            response.put("userId", userId);
            response.put("otherUserId", otherUserId);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }
}