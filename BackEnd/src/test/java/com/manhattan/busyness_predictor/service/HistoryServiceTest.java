package com.manhattan.busyness_predictor.service;

import com.manhattan.busyness_predictor.model.History;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.HistoryRepository;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import com.manhattan.busyness_predictor.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class HistoryServiceTest {

    @Mock
    private HistoryRepository historyRepository;

    @Mock
    private LocationRepository locationRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private HistoryService historyService;

    private User testUser;
    private Location testLocation;
    private Location anotherLocation;
    private Location thirdLocation;
    private History testHistory;
    private History anotherHistory;
    private History thirdHistory;

    @BeforeEach
    void setUp() {
        // Create test user
        testUser = createTestUser(1, "testuser", "test@example.com", "Test", "User");

        // Create test locations
        testLocation = createTestLocation(1, "Test Restaurant", "Great food place");
        anotherLocation = createTestLocation(2, "Another Restaurant", "Another great place");
        thirdLocation = createTestLocation(3, "Third Restaurant", "Third great place");

        // Create test history entries with different timestamps
        testHistory = new History(testUser, testLocation);
        testHistory.setId(1);
        testHistory.setTimestamp(LocalDateTime.now().minusHours(3));

        anotherHistory = new History(testUser, anotherLocation);
        anotherHistory.setId(2);
        anotherHistory.setTimestamp(LocalDateTime.now().minusHours(1));

        thirdHistory = new History(testUser, thirdLocation);
        thirdHistory.setId(3);
        thirdHistory.setTimestamp(LocalDateTime.now());
    }

    private User createTestUser(Integer id, String username, String email, String firstName, String lastName) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        user.setEmail(email);
        user.setFirstName(firstName);
        user.setLastName(lastName);
        user.setCreatedAt(LocalDateTime.now());
        user.setUpdatedAt(LocalDateTime.now());
        return user;
    }

    private Location createTestLocation(Integer id, String name, String description) {
        Location location = new Location();
        location.setId(id);
        location.setName(name);
        location.setDescription(description);
        location.setLat(40.7589 + id * 0.001); // Slightly different coordinates
        location.setLng(-73.9851 + id * 0.001);
        location.setAddress("Test Address " + id);
        location.setReview(4.5f);
        location.setNumReviews(100);
        location.setPrice(2);
        location.setIsRestaurant(true);
        location.setIsBar(false);
        location.setIsClub(false);
        location.setIsLandmark(false);
        location.setZone("Test Zone " + id);
        return location;
    }

    @Test
    void whenAddToHistory_withValidUserAndLocation_thenSaveHistory() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation));
        when(historyRepository.save(any(History.class))).thenReturn(testHistory);

        // When
        historyService.addToHistory(1, 1);

        // Then
        verify(userRepository).findById(1);
        verify(locationRepository).findById(1);
        verify(historyRepository).save(any(History.class));
    }

    @Test
    void whenAddToHistory_withNonExistentUser_thenThrowException() {
        // Given
        when(userRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class,
            () -> historyService.addToHistory(999, 1));
        assertEquals("User not found", exception.getMessage());

        verify(userRepository).findById(999);
        verify(locationRepository, never()).findById(any());
        verify(historyRepository, never()).save(any());
    }

    @Test
    void whenAddToHistory_withNonExistentLocation_thenThrowException() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(locationRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class,
            () -> historyService.addToHistory(1, 999));
        assertEquals("Location not found", exception.getMessage());

        verify(userRepository).findById(1);
        verify(locationRepository).findById(999);
        verify(historyRepository, never()).save(any());
    }

    @Test
    void whenGetSearchHistory_withValidUser_thenReturnLocationsInDescOrder() {
        // Given
        List<History> historyEntries = Arrays.asList(thirdHistory, anotherHistory, testHistory); // Most recent first
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(historyRepository.findByUserOrderByTimestampDesc(testUser)).thenReturn(historyEntries);

        // When
        List<Location> result = historyService.getSearchHistory(1);

        // Then
        assertNotNull(result);
        assertEquals(3, result.size());
        assertEquals(thirdLocation.getId(), result.get(0).getId()); // Most recent first
        assertEquals(anotherLocation.getId(), result.get(1).getId());
        assertEquals(testLocation.getId(), result.get(2).getId());
        verify(userRepository).findById(1);
        verify(historyRepository).findByUserOrderByTimestampDesc(testUser);
    }

    @Test
    void whenGetSearchHistory_withNonExistentUser_thenThrowException() {
        // Given
        when(userRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class,
            () -> historyService.getSearchHistory(999));
        assertEquals("User not found", exception.getMessage());

        verify(userRepository).findById(999);
        verify(historyRepository, never()).findByUserOrderByTimestampDesc(any());
    }

    @Test
    void whenGetSearchHistory_withNoHistory_thenReturnEmptyList() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(historyRepository.findByUserOrderByTimestampDesc(testUser)).thenReturn(Arrays.asList());

        // When
        List<Location> result = historyService.getSearchHistory(1);

        // Then
        assertNotNull(result);
        assertTrue(result.isEmpty());
        verify(userRepository).findById(1);
        verify(historyRepository).findByUserOrderByTimestampDesc(testUser);
    }

    @Test
    void whenGetSearchHistory_withDuplicateLocations_thenReturnDistinctLocations() {
        // Given
        // Create duplicate history entries for the same location
        History duplicateTestHistory = new History(testUser, testLocation);
        duplicateTestHistory.setId(4);
        duplicateTestHistory.setTimestamp(LocalDateTime.now().minusMinutes(30));

        History anotherDuplicateHistory = new History(testUser, testLocation);
        anotherDuplicateHistory.setId(5);
        anotherDuplicateHistory.setTimestamp(LocalDateTime.now().minusMinutes(15));

        List<History> historyEntriesWithDuplicates = Arrays.asList(
            thirdHistory,           // Location 3 (most recent)
            anotherDuplicateHistory, // Location 1 (duplicate)
            anotherHistory,         // Location 2
            duplicateTestHistory,   // Location 1 (duplicate)
            testHistory             // Location 1 (original)
        );

        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(historyRepository.findByUserOrderByTimestampDesc(testUser)).thenReturn(historyEntriesWithDuplicates);

        // When
        List<Location> result = historyService.getSearchHistory(1);

        // Then
        assertNotNull(result);
        assertEquals(3, result.size()); // Should be distinct - only 3 unique locations
        assertEquals(thirdLocation.getId(), result.get(0).getId()); // Location 3 first
        assertEquals(testLocation.getId(), result.get(1).getId());  // Location 1 second (first occurrence)
        assertEquals(anotherLocation.getId(), result.get(2).getId()); // Location 2 third
        verify(userRepository).findById(1);
        verify(historyRepository).findByUserOrderByTimestampDesc(testUser);
    }

    @Test
    void whenClearHistory_withValidUser_thenDeleteAllUserHistory() {
        // Given
        List<History> userHistory = Arrays.asList(testHistory, anotherHistory, thirdHistory);
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(historyRepository.findByUser(testUser)).thenReturn(userHistory);

        // When
        historyService.clearHistory(1);

        // Then
        verify(userRepository).findById(1);
        verify(historyRepository).findByUser(testUser);
        verify(historyRepository).deleteAll(userHistory);
    }

    @Test
    void whenClearHistory_withNonExistentUser_thenThrowException() {
        // Given
        when(userRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class,
            () -> historyService.clearHistory(999));
        assertEquals("User not found", exception.getMessage());

        verify(userRepository).findById(999);
        verify(historyRepository, never()).findByUser(any());
        verify(historyRepository, never()).deleteAll(any());
    }

    @Test
    void whenClearHistory_withNoHistory_thenDeleteEmptyList() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(historyRepository.findByUser(testUser)).thenReturn(Arrays.asList());

        // When
        historyService.clearHistory(1);

        // Then
        verify(userRepository).findById(1);
        verify(historyRepository).findByUser(testUser);
        verify(historyRepository).deleteAll(Arrays.asList());
    }

    @Test
    void whenAddToHistory_thenHistoryHasCorrectFields() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation));
        when(historyRepository.save(any(History.class))).thenAnswer(invocation -> {
            History saved = invocation.getArgument(0);
            saved.setId(1);
            return saved;
        });

        // When
        historyService.addToHistory(1, 1);

        // Then
        verify(historyRepository).save(argThat(history -> {
            assertNotNull(history.getTimestamp());
            assertEquals(testUser, history.getUser());
            assertEquals(testLocation, history.getLocation());
            // Verify timestamp is recent (within last minute)
            assertTrue(history.getTimestamp().isAfter(LocalDateTime.now().minusMinutes(1)));
            return true;
        }));
    }

    @Test
    void whenGetSearchHistory_withMultipleUsers_thenReturnOnlyCurrentUserHistory() {
        // Given
        User anotherUser = createTestUser(2, "anotheruser", "another@example.com", "Another", "User");
        History anotherUserHistory = new History(anotherUser, testLocation);
        anotherUserHistory.setId(4);

        // Only return current user's history
        List<History> currentUserHistory = Arrays.asList(thirdHistory, anotherHistory);
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(historyRepository.findByUserOrderByTimestampDesc(testUser)).thenReturn(currentUserHistory);

        // When
        List<Location> result = historyService.getSearchHistory(1);

        // Then
        assertNotNull(result);
        assertEquals(2, result.size());
        assertEquals(thirdLocation.getId(), result.get(0).getId());
        assertEquals(anotherLocation.getId(), result.get(1).getId());
        verify(userRepository).findById(1);
        verify(historyRepository).findByUserOrderByTimestampDesc(testUser);
    }

    @Test
    void whenAddToHistory_withSameLocationMultipleTimes_thenSaveEachTime() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation));
        when(historyRepository.save(any(History.class))).thenReturn(testHistory);

        // When
        historyService.addToHistory(1, 1);
        historyService.addToHistory(1, 1); // Add same location again

        // Then
        verify(userRepository, times(2)).findById(1);
        verify(locationRepository, times(2)).findById(1);
        verify(historyRepository, times(2)).save(any(History.class));
    }

    @Test
    void whenGetSearchHistory_withLargeHistoryList_thenReturnDistinctLocationsInOrder() {
        // Given - Simulate a large history with many duplicates
        History[] manyHistories = new History[10];
        for (int i = 0; i < 10; i++) {
            Location location = (i % 3 == 0) ? testLocation : 
                               (i % 3 == 1) ? anotherLocation : thirdLocation;
            manyHistories[i] = new History(testUser, location);
            manyHistories[i].setId(i + 1);
            manyHistories[i].setTimestamp(LocalDateTime.now().minusHours(10 - i));
        }

        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(historyRepository.findByUserOrderByTimestampDesc(testUser)).thenReturn(Arrays.asList(manyHistories));

        // When
        List<Location> result = historyService.getSearchHistory(1);

        // Then
        assertNotNull(result);
        assertEquals(3, result.size()); // Should still be only 3 distinct locations
        verify(userRepository).findById(1);
        verify(historyRepository).findByUserOrderByTimestampDesc(testUser);
    }
}