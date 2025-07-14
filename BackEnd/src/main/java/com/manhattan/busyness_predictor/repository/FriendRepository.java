package com.manhattan.busyness_predictor.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.manhattan.busyness_predictor.model.Friend;
import com.manhattan.busyness_predictor.model.Friend.FriendStatus;
import com.manhattan.busyness_predictor.model.User;

@Repository
public interface FriendRepository extends JpaRepository<Friend, Integer> {

    // Find a specific friendship request (pending or accepted)
    @Query("SELECT f FROM Friend f WHERE " +
           "(f.requester = :user1 AND f.receiver = :user2) OR " +
           "(f.requester = :user2 AND f.receiver = :user1)")
    Optional<Friend> findRelationshipBetweenUsers(@Param("user1") User user1, @Param("user2") User user2);

    // Find a specific pending request from a requester to a receiver
    @Query("SELECT f FROM Friend f WHERE f.requester = :requester AND f.receiver = :receiver AND f.status = 'PENDING'")
    Optional<Friend> findPendingRequest(@Param("requester") User requester, @Param("receiver") User receiver);

    // Find all friendships for a user with a given status
    @Query("SELECT f FROM Friend f WHERE (f.requester = :user OR f.receiver = :user) AND f.status = :status")
    List<Friend> findByUserIdAndStatus(@Param("user") User user, @Param("status") FriendStatus status);

    // Find all pending requests sent by a user (derived query)
    List<Friend> findByRequesterAndStatus(User requester, FriendStatus status);

    // Find all pending requests received by a user (derived query)
    List<Friend> findByReceiverAndStatus(User receiver, FriendStatus status);
}