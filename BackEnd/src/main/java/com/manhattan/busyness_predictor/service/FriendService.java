package com.manhattan.busyness_predictor.service;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.manhattan.busyness_predictor.model.Friend;
import com.manhattan.busyness_predictor.model.Friend.FriendStatus;
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
    public Friend addFriendByUsername(Integer userId, String username) {
        // Find user to add by username
        User friendUser = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User with username '" + username + "' not found"));

        // Check if trying to add themselves
        if (userId.equals(friendUser.getId())) {
            throw new RuntimeException("Cannot add yourself as a friend");
        }

        // Check if a relationship (pending or accepted) already exists
        if (friendRepository.findRelationshipBetweenUsers(userId, friendUser.getId()).isPresent()) {
            throw new RuntimeException("A friendship or request already exists with " + username);
        }

        // Create new friendship
        Friend friendship = new Friend(userId, friendUser.getId());
        return friendRepository.save(friendship);
    }

    @Transactional
    public void removeFriend(Integer userId, Integer friendId) {
        Friend friendship = friendRepository.findRelationshipBetweenUsers(userId, friendId)
                .orElseThrow(() -> new RuntimeException("You are not friends with this user"));

        friendRepository.delete(friendship);
    }

    @Transactional
    public void removeFriendByUsername(Integer userId, String username) {
        // Find the friend by username
        User friendUser = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User with username '" + username + "' not found"));

        // Remove friendship
        removeFriend(userId, friendUser.getId());
    }

    @Transactional
    public void acceptFriendRequest(Integer receiverId, Integer requesterId) {
        Friend request = friendRepository.findPendingRequest(requesterId, receiverId)
                .orElseThrow(() -> new RuntimeException("Friend request not found."));

        request.setStatus(FriendStatus.ACCEPTED);
        friendRepository.save(request);
    }

    @Transactional
    public void declineFriendRequest(Integer receiverId, Integer requesterId) {
        Friend request = friendRepository.findPendingRequest(requesterId, receiverId)
                .orElseThrow(() -> new RuntimeException("Friend request not found."));

        friendRepository.delete(request);
    }

    public List<User> getFriendsByStatus(Integer userId, FriendStatus status) {
        List<Friend> friendships = friendRepository.findByUserIdAndStatus(userId, status);
        List<Integer> friendIds = friendships.stream()
                .map(f -> f.getRequesterId().equals(userId) ? f.getReceiverId() : f.getRequesterId())
                .collect(Collectors.toList());

        return userRepository.findAllById(friendIds).stream()
                .peek(user -> user.setPassword(null))
                .collect(Collectors.toList());
    }

    public List<User> getSentRequests(Integer userId) {
        List<Friend> requests = friendRepository.findByRequesterIdAndStatus(userId, FriendStatus.PENDING);
        List<Integer> receiverIds = requests.stream().map(Friend::getReceiverId).collect(Collectors.toList());

        return userRepository.findAllById(receiverIds).stream()
                .peek(user -> user.setPassword(null))
                .collect(Collectors.toList());
    }

    public List<User> getReceivedRequests(Integer userId) {
        List<Friend> requests = friendRepository.findByReceiverIdAndStatus(userId, FriendStatus.PENDING);
        List<Integer> requesterIds = requests.stream().map(Friend::getRequesterId).collect(Collectors.toList());

        return userRepository.findAllById(requesterIds).stream()
                .peek(user -> user.setPassword(null))
                .collect(Collectors.toList());
    }

    public List<User> searchUsersByUsername(String query, Integer currentUserId) {
        // Find IDs of users with an existing relationship (pending or accepted)
        List<Integer> excludedIds = friendRepository.findByUserIdAndStatus(currentUserId, FriendStatus.ACCEPTED).stream()
                .map(f -> f.getRequesterId().equals(currentUserId) ? f.getReceiverId() : f.getRequesterId())
                .collect(Collectors.toList());
        friendRepository.findByUserIdAndStatus(currentUserId, FriendStatus.PENDING).stream()
                .map(f -> f.getRequesterId().equals(currentUserId) ? f.getReceiverId() : f.getRequesterId())
                .forEach(excludedIds::add);
        excludedIds.add(currentUserId); // Exclude self
        
        List<User> users = userRepository.findAll().stream()
                .filter(user -> user.getUsername().toLowerCase().contains(query.toLowerCase()))
                .filter(user -> !excludedIds.contains(user.getId()))
                .limit(10) // Limit results
                .collect(Collectors.toList());

        return users.stream()
                .peek(user -> user.setPassword(null))
                .collect(Collectors.toList());
    }

    public boolean areFriends(Integer userId1, Integer userId2) {
        return friendRepository.findRelationshipBetweenUsers(userId1, userId2)
                .map(f -> f.getStatus() == FriendStatus.ACCEPTED)
                .orElse(false);
    }

    public Integer getFriendCount(Integer userId) {
        return friendRepository.findByUserIdAndStatus(userId, FriendStatus.ACCEPTED).size();
    }

    public List<User> getMutualFriends(Integer userId1, Integer userId2) {
        List<User> user1Friends = getFriendsByStatus(userId1, FriendStatus.ACCEPTED);
        List<User> user2Friends = getFriendsByStatus(userId2, FriendStatus.ACCEPTED);

        List<Integer> user1FriendIds = user1Friends.stream().map(User::getId).collect(Collectors.toList());
        List<Integer> user2FriendIds = user2Friends.stream().map(User::getId).collect(Collectors.toList());

        // Find mutual friends
        List<Integer> mutualFriendIds = user1FriendIds.stream()
                .filter(user2FriendIds::contains)
                .collect(Collectors.toList());

        List<User> mutualFriends = userRepository.findAllById(mutualFriendIds);

        return mutualFriends.stream()
                .peek(user -> user.setPassword(null))
                .collect(Collectors.toList());
    }

    public List<User> getSuggestedFriends(Integer userId, int limit) {
        List<User> currentFriendsList = getFriendsByStatus(userId, FriendStatus.ACCEPTED);
        List<Integer> currentFriends = currentFriendsList.stream().map(User::getId).collect(Collectors.toList());
        currentFriends.add(userId);

        // Find friends of friends who are not already friends
        List<Integer> suggestedIds = currentFriends.stream()
                .flatMap(friendId -> getFriendsByStatus(friendId, FriendStatus.ACCEPTED).stream().map(User::getId))
                .filter(id -> !currentFriends.contains(id))
                .distinct()
                .limit(limit)
                .collect(Collectors.toList());

        // Get user objects
        List<User> suggestedUsers = userRepository.findAllById(suggestedIds);
        return suggestedUsers.stream()
                .peek(user -> user.setPassword(null))
                .collect(Collectors.toList());
    }
}