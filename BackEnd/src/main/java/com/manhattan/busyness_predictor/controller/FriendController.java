package com.manhattan.busyness_predictor.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.manhattan.busyness_predictor.dto.AddFriendRequest;
import com.manhattan.busyness_predictor.dto.UserDto;
import com.manhattan.busyness_predictor.model.Friend;
import com.manhattan.busyness_predictor.security.UserPrincipal;
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
            @AuthenticationPrincipal UserPrincipal currentUser,
            @Valid @RequestBody AddFriendRequest request) {
        Friend friendship = friendService.addFriendByUsername(currentUser.getId(), request.getUsername());
        
        Map<String, Object> response = new HashMap<>();
        response.put("message", "Friend added successfully");
        // Note: Returning the raw friendship entity is okay here as it's simple,
        // but a DTO would be better practice for more complex objects.
        response.put("friendshipId", friendship.getId());
        response.put("friendAddedAt", friendship.getTimestamp());
        
        return ResponseEntity.ok(response);
    }

    // Remove friend
    @DeleteMapping("/remove")
    public ResponseEntity<Map<String, Object>> removeFriend(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @RequestParam Integer friendId) {
        friendService.removeFriend(currentUser.getId(), friendId);
        
        Map<String, Object> response = new HashMap<>();
        response.put("message", "Friend removed successfully");
        
        return ResponseEntity.ok(response);
    }

    // Remove friend by username
    @DeleteMapping("/remove-by-username")
    public ResponseEntity<Map<String, Object>> removeFriendByUsername(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @RequestParam String username) {
        friendService.removeFriendByUsername(currentUser.getId(), username);
        
        Map<String, Object> response = new HashMap<>();
        response.put("message", "Friend removed successfully");
        response.put("removedUsername", username);
        
        return ResponseEntity.ok(response);
    }

    // Get user's friends list
    @GetMapping("/list")
    public ResponseEntity<Map<String, Object>> getFriendsList(@AuthenticationPrincipal UserPrincipal currentUser) {
        List<UserDto> acceptedFriends = friendService.getFriendsByStatus(currentUser.getId(), Friend.FriendStatus.ACCEPTED)
                .stream().map(UserDto::fromUser).collect(Collectors.toList());

        List<UserDto> sentRequests = friendService.getSentRequests(currentUser.getId())
                .stream().map(UserDto::fromUser).collect(Collectors.toList());

        List<UserDto> receivedRequests = friendService.getReceivedRequests(currentUser.getId())
                .stream().map(UserDto::fromUser).collect(Collectors.toList());

        Map<String, Object> response = new HashMap<>();
        response.put("accepted", acceptedFriends);
        response.put("sent", sentRequests);
        response.put("received", receivedRequests);
        response.put("totalFriends", acceptedFriends.size());
        
        return ResponseEntity.ok(response);
    }

    @PostMapping("/accept/{requesterId}")
    public ResponseEntity<Map<String, Object>> acceptFriendRequest(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Integer requesterId) {
        friendService.acceptFriendRequest(currentUser.getId(), requesterId);

        Map<String, Object> response = new HashMap<>();
        response.put("message", "Friend request accepted");
        return ResponseEntity.ok(response);
    }

    @PostMapping("/decline/{requesterId}")
    public ResponseEntity<Map<String, Object>> declineFriendRequest(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Integer requesterId) {
        friendService.declineFriendRequest(currentUser.getId(), requesterId);

        Map<String, Object> response = new HashMap<>();
        response.put("message", "Friend request declined");
        return ResponseEntity.ok(response);
    }

    // Search users by username (for adding friends)
    @GetMapping("/search")
    public ResponseEntity<Map<String, Object>> searchUsers(
            @RequestParam String query,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        List<UserDto> users = friendService.searchUsersByUsername(query, currentUser.getId())
                .stream().map(UserDto::fromUser).collect(Collectors.toList());

        Map<String, Object> response = new HashMap<>();
        response.put("users", users);
        response.put("totalResults", users.size());
        
        return ResponseEntity.ok(response);
    }

    // Check if two users are friends
    @GetMapping("/check")
    public ResponseEntity<Map<String, Object>> checkFriendship(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @RequestParam Integer otherUserId) {
        boolean areFriends = friendService.areFriends(currentUser.getId(), otherUserId);
        
        Map<String, Object> response = new HashMap<>();
        response.put("areFriends", areFriends);
        response.put("userId", currentUser.getId());
        response.put("otherUserId", otherUserId);
        
        return ResponseEntity.ok(response);
    }

    // Get friend count
    @GetMapping("/count")
    public ResponseEntity<Map<String, Object>> getFriendCount(@AuthenticationPrincipal UserPrincipal currentUser) {
        Integer friendCount = friendService.getFriendCount(currentUser.getId());
        
        Map<String, Object> response = new HashMap<>();
        response.put("userId", currentUser.getId());
        response.put("friendCount", friendCount);
        
        return ResponseEntity.ok(response);
    }

    // Get mutual friends between two users
    @GetMapping("/mutual")
    public ResponseEntity<Map<String, Object>> getMutualFriends(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @RequestParam Integer otherUserId) {
        List<UserDto> mutualFriends = friendService.getMutualFriends(currentUser.getId(), otherUserId)
                .stream().map(UserDto::fromUser).collect(Collectors.toList());
        
        Map<String, Object> response = new HashMap<>();
        response.put("mutualFriends", mutualFriends);
        response.put("totalMutual", mutualFriends.size());
        response.put("userId", currentUser.getId());
        response.put("otherUserId", otherUserId);
        
        return ResponseEntity.ok(response);
    }
}