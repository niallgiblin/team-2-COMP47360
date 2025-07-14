package com.manhattan.busyness_predictor.service;

import java.util.ArrayList;
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
    public Friend addFriendByUsername(Integer currentUserId, String friendUsername) {
        User currentUser = userRepository.findById(currentUserId)
                .orElseThrow(() -> new RuntimeException("Authenticated user not found"));
        // Find user to add by username
        User friendUser = userRepository.findByUsername(friendUsername)
                .orElseThrow(() -> new RuntimeException("User with username '" + friendUsername + "' not found"));

        // Check if trying to add themselves
        if (currentUserId.equals(friendUser.getId())) {
            throw new RuntimeException("Cannot add yourself as a friend");
        }

        // Check if a relationship (pending or accepted) already exists
        if (friendRepository.findRelationshipBetweenUsers(currentUser, friendUser).isPresent()) {
            throw new RuntimeException("A friendship or request already exists with " + friendUsername);
        }

        // Create new friendship
        Friend friendship = new Friend(currentUser, friendUser);
        return friendRepository.save(friendship);
    }

    @Transactional
    public void removeFriend(Integer userId, Integer friendId) {
        User user1 = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        User user2 = userRepository.findById(friendId).orElseThrow(() -> new RuntimeException("Friend not found"));
        Friend friendship = friendRepository.findRelationshipBetweenUsers(user1, user2)
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
        User receiver = userRepository.findById(receiverId).orElseThrow(() -> new RuntimeException("User not found"));
        User requester = userRepository.findById(requesterId).orElseThrow(() -> new RuntimeException("Requester not found"));
        Friend request = friendRepository.findPendingRequest(requester, receiver)
                .orElseThrow(() -> new RuntimeException("Friend request not found."));

        request.setStatus(FriendStatus.ACCEPTED);
        friendRepository.save(request);
    }

    @Transactional
    public void declineFriendRequest(Integer receiverId, Integer requesterId) {
        User receiver = userRepository.findById(receiverId).orElseThrow(() -> new RuntimeException("User not found"));
        User requester = userRepository.findById(requesterId).orElseThrow(() -> new RuntimeException("Requester not found"));
        Friend request = friendRepository.findPendingRequest(requester, receiver)
                .orElseThrow(() -> new RuntimeException("Friend request not found."));

        friendRepository.delete(request);
    }

    public List<User> getFriendsByStatus(Integer userId, FriendStatus status) {
        User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        List<Friend> friendships = friendRepository.findByUserIdAndStatus(user, status);
        return friendships.stream()
                .map(f -> f.getRequester().equals(user) ? f.getReceiver() : f.getRequester())
                .collect(Collectors.toList());
    }

    public List<User> getSentRequests(Integer userId) {
        User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        List<Friend> requests = friendRepository.findByRequesterAndStatus(user, FriendStatus.PENDING);
        return requests.stream()
                .map(Friend::getReceiver)
                .collect(Collectors.toList());
    }

    public List<User> getReceivedRequests(Integer userId) {
        User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        List<Friend> requests = friendRepository.findByReceiverAndStatus(user, FriendStatus.PENDING);
        return requests.stream()
                .map(Friend::getRequester)
                .collect(Collectors.toList());
    }

    public List<User> searchUsersByUsername(String query, Integer currentUserId) {
        User currentUser = userRepository.findById(currentUserId).orElseThrow(() -> new RuntimeException("User not found"));
        // Find IDs of users with an existing relationship (pending or accepted)
        List<User> existingRelations = new ArrayList<>();
        existingRelations.addAll(getFriendsByStatus(currentUserId, FriendStatus.ACCEPTED));
        existingRelations.addAll(getSentRequests(currentUserId));
        existingRelations.addAll(getReceivedRequests(currentUserId));

        List<Integer> excludedIds = existingRelations.stream()
                .map(User::getId)
                .collect(Collectors.toList());
        excludedIds.add(currentUserId); // Exclude self
        
        // This is inefficient on large user tables. A custom query in the repository would be better.
        List<User> users = userRepository.findAll().stream()
                .filter(user -> user.getUsername().toLowerCase().contains(query.toLowerCase()))
                .filter(user -> !excludedIds.contains(user.getId()))
                .limit(10) // Limit results
                .collect(Collectors.toList());

        return users;
    }

    public boolean areFriends(Integer userId1, Integer userId2) {
        User user1 = userRepository.findById(userId1).orElse(null);
        User user2 = userRepository.findById(userId2).orElse(null);
        if (user1 == null || user2 == null) {
            return false;
        }
        return friendRepository.findRelationshipBetweenUsers(user1, user2)
                .map(f -> f.getStatus() == FriendStatus.ACCEPTED)
                .orElse(false);
    }

    public Integer getFriendCount(Integer userId) {
        User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        return friendRepository.findByUserIdAndStatus(user, FriendStatus.ACCEPTED).size();
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

        return mutualFriends;
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
        return suggestedUsers;
    }
}