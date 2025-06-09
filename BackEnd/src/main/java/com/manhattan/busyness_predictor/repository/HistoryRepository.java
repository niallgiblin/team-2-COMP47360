package com.manhattan.busyness_predictor.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.manhattan.busyness_predictor.model.History;

@Repository
public interface HistoryRepository extends JpaRepository<History, Long> {

    List<History> findByUserId(Long userId);

    List<History> findByUserIdOrderByTimestampDesc(Long userId);

    List<History> findByLocationId(Long locationId);

    // Find recent searches (last 30 days)
    @Query("SELECT h FROM History h WHERE h.userId = :userId AND h.timestamp > :since ORDER BY h.timestamp DESC")
    List<History> findRecentSearches(@Param("userId") Long userId, @Param("since") LocalDateTime since);

    // Get most searched locations
    @Query("SELECT h.locationId, COUNT(h) as searchCount FROM History h GROUP BY h.locationId ORDER BY searchCount DESC")
    List<Object[]> getMostSearchedLocations();

    // Delete old history entries
    void deleteByTimestampBefore(LocalDateTime timestamp);
}