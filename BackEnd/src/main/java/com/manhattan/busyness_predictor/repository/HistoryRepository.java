package com.manhattan.busyness_predictor.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.manhattan.busyness_predictor.model.History;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.User;

@Repository
public interface HistoryRepository extends JpaRepository<History, Integer> {

    List<History> findByUser(User user);

    List<History> findByUserOrderByTimestampDesc(User user);

    List<History> findByLocation(Location location);

    // Find recent searches (last 30 days)
    @Query("SELECT h FROM History h WHERE h.user = :user AND h.timestamp > :since ORDER BY h.timestamp DESC")
    List<History> findRecentSearches(@Param("user") User user, @Param("since") LocalDateTime since);

    // Get most searched locations
    @Query("SELECT h.location, COUNT(h) as searchCount FROM History h GROUP BY h.location ORDER BY searchCount DESC")
    List<Object[]> getMostSearchedLocations();

    // Delete old history entries
    void deleteByTimestampBefore(LocalDateTime timestamp);
}