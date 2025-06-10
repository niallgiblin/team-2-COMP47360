package com.manhattan.busyness_predictor.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.manhattan.busyness_predictor.model.Friend;

@Repository
public interface FriendRepository extends JpaRepository<Friend, Integer> {

    // Find friendship between two users
    @Query("SELECT f FROM Friend f WHERE " +
           "(f.user1 = :userId1 AND f.user2 = :userId2) OR " +
           "(f.user1 = :userId2 AND f.user2 = :userId1)")
    Optional<Friend> findFriendshipBetweenUsers(@Param("userId1") Integer userId1, 
                                               @Param("userId2") Integer userId2);

    // Find all friendships for a user
    @Query("SELECT f FROM Friend f WHERE f.user1 = :userId OR f.user2 = :userId")
    List<Friend> findFriendshipsByUserId(@Param("userId") Integer userId);

    // Get friend IDs for a user
    @Query("SELECT CASE " +
           "WHEN f.user1 = :userId THEN f.user2 " +
           "ELSE f.user1 END " +
           "FROM Friend f WHERE f.user1 = :userId OR f.user2 = :userId")
    List<Integer> findFriendIdsByUserId(@Param("userId") Integer userId);

    // Check if friendship exists
    @Query("SELECT COUNT(f) > 0 FROM Friend f WHERE " +
           "(f.user1 = :userId1 AND f.user2 = :userId2) OR " +
           "(f.user1 = :userId2 AND f.user2 = :userId1)")
    boolean existsFriendshipBetweenUsers(@Param("userId1") Integer userId1, 
                                        @Param("userId2") Integer userId2);

    // Count friends for a user
    @Query("SELECT COUNT(f) FROM Friend f WHERE f.user1 = :userId OR f.user2 = :userId")
    Integer countFriendsByUserId(@Param("userId") Integer userId);

    // Delete friendship between users
    @Query("DELETE FROM Friend f WHERE " +
           "(f.user1 = :userId1 AND f.user2 = :userId2) OR " +
           "(f.user1 = :userId2 AND f.user2 = :userId1)")
    void deleteFriendshipBetweenUsers(@Param("userId1") Integer userId1, 
                                     @Param("userId2") Integer userId2);
}