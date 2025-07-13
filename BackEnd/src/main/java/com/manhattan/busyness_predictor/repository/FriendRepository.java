package com.manhattan.busyness_predictor.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.manhattan.busyness_predictor.model.Friend;
import com.manhattan.busyness_predictor.model.Friend.FriendStatus;

@Repository
public interface FriendRepository extends JpaRepository<Friend, Integer> {

    // Find a specific friendship request (pending or accepted)
    @Query("SELECT f FROM Friend f WHERE " +
           "(f.requesterId = :userId1 AND f.receiverId = :userId2) OR " +
           "(f.requesterId = :userId2 AND f.receiverId = :userId1)")
    Optional<Friend> findRelationshipBetweenUsers(@Param("userId1") Integer userId1, @Param("userId2") Integer userId2);

    // Find a specific pending request from a requester to a receiver
    @Query("SELECT f FROM Friend f WHERE f.requesterId = :requesterId AND f.receiverId = :receiverId AND f.status = 'PENDING'")
    Optional<Friend> findPendingRequest(@Param("requesterId") Integer requesterId, @Param("receiverId") Integer receiverId);

    // Find all friendships for a user with a given status
    @Query("SELECT f FROM Friend f WHERE (f.requesterId = :userId OR f.receiverId = :userId) AND f.status = :status")
    List<Friend> findByUserIdAndStatus(@Param("userId") Integer userId, @Param("status") FriendStatus status);

    // Find all pending requests sent by a user (derived query)
    List<Friend> findByRequesterIdAndStatus(Integer requesterId, FriendStatus status);

    // Find all pending requests received by a user (derived query)
    List<Friend> findByReceiverIdAndStatus(Integer receiverId, FriendStatus status);
}