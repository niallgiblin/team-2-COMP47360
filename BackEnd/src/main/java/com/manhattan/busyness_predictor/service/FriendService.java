package com.manhattan.busyness_predictor.service;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.manhattan.busyness_predictor.model.Friend;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.FriendRepository;
import com.manhattan.busyness_predictor.repository.UserRepository;

@Service
public class FriendService {

    @Autowired
    private FriendRepository friendRepository;

    @Autowired
    private UserRepository userRepository;

    @Transactional
    public Friend addFriendByUsername(Long userId, String username) {
        // Find user making the request
        User currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Find user to add by username
        User friendUser = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User with username '" + username + "' not found"));

        // Check if trying to add themselves
        if (userId.equals(friendUser.getId())) {
            throw new RuntimeException("Cannot add yourself as a friend");
        }

        // Check if friendship already exists
        if (friendRepository.existsFriendshipBetweenUsers(userId, friendUser.getId())) {
            throw new RuntimeException("You are already friends with " + username);
        }

        // Create new friendship
        Friend friendship = new Friend(userId, friendUser.getId());
        return friendRepository.save(friendship);
    }

    @Transactional
    public void removeFriend(Long userId, Long friendId) {
        // Verify both users exist
        userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        userRepository.findById(friendId)
                .orElseThrow(() -> new RuntimeException("Friend not found"));

        // Check if friendship exists
        if (!friendRepository.existsFriendshipBetweenUsers(userId, friendId)) {
            throw new RuntimeException("You are not friends with this user");
        }

        // Remove the friendship
        friendRepository.deleteFriendshipBetweenUsers(userId, friendId);
    }

    @Transactional
    public void removeFriendByUsername(Long userId, String username) {
        // Find the friend by username
        User friendUser = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User with username '" + username + "' not found"));

        // Remove friendship
        removeFriend(userId, friendUser.getId());
    }

    public List<User> getFriendsList(Long userId) {
        // Verify user exists
        userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Get friend IDs
        List<Long> friendIds = friendRepository.findFriendIdsByUserId(userId);
        
        // Get friend user objects
        List<User> friends = userRepository.findAllById(friendIds);
        
        // Clear passwords before returning
        return friends.stream()
                .peek(user -> user.setPassword(null))
                .collect(Collectors.toList());
    }

    public List<User> searchUsersByUsername(String query, Long currentUserId) {
        // Search users by username (excluding current user and existing friends)
        List<Long> friendIds = friendRepository.findFriendIdsByUserId(currentUserId);
        friendIds.add(currentUserId); // Also exclude current user
        
        List<User> users = userRepository.findAll().stream()
                .filter(user -> user.getUsername().toLowerCase().contains(query.toLowerCase()))
                .filter(user -> !friendIds.contains(user.getId()))
                .limit(10) // Limit results
                .collect(Collectors.toList());

        // Clear passwords before returning
        return users.stream()
                .peek(user -> user.setPassword(null))
                .collect(Collectors.toList());
    }

    public boolean areFriends(Long userId1, Long userId2) {
        return friendRepository.existsFriendshipBetweenUsers(userId1, userId2);
    }

    public long getFriendCount(Long userId) {
        // Verify user exists
        userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        return friendRepository.countFriendsByUserId(userId);
    }

    public List<User> getMutualFriends(Long userId1, Long userId2) {
        // Verify both users exist
        userRepository.findById(userId1)
                .orElseThrow(() -> new RuntimeException("First user not found"));
        userRepository.findById(userId2)
                .orElseThrow(() -> new RuntimeException("Second user not found"));

        // Get friend lists for both users
        List<Long> user1Friends = friendRepository.findFriendIdsByUserId(userId1);
        List<Long> user2Friends = friendRepository.findFriendIdsByUserId(userId2);

        // Find mutual friends
        List<Long> mutualFriendIds = user1Friends.stream()
                .filter(user2Friends::contains)
                .collect(Collectors.toList());

        // Get user objects for mutual friends
        List<User> mutualFriends = userRepository.findAllById(mutualFriendIds);

        // Clear passwords before returning
        return mutualFriends.stream()
                .peek(user -> user.setPassword(null))
                .collect(Collectors.toList());
    }

    public List<User> getSuggestedFriends(Long userId, int limit) {
        // Get user's current friends
        List<Long> currentFriends = friendRepository.findFriendIdsByUserId(userId);
        currentFriends.add(userId); // Exclude self

        // Find friends of friends who are not already friends
        List<Long> suggestedIds = currentFriends.stream()
                .flatMap(friendId -> friendRepository.findFriendIdsByUserId(friendId).stream())
                .filter(id -> !currentFriends.contains(id))
                .distinct()
                .limit(limit)
                .collect(Collectors.toList());

        // Get user objects
        List<User> suggestedUsers = userRepository.findAllById(suggestedIds);

        // Clear passwords before returning
        return suggestedUsers.stream()
                .peek(user -> user.setPassword(null))
                .collect(Collectors.toList());
    }
}