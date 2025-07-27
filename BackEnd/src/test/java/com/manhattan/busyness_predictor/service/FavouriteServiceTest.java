package com.manhattan.busyness_predictor.service;

import com.manhattan.busyness_predictor.model.Favourite;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.FavouriteRepository;
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
class FavouriteServiceTest {

    @Mock
    private FavouriteRepository favouriteRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private LocationRepository locationRepository;

    @InjectMocks
    private FavouriteService favouriteService;

    private User testUser;
    private Location testLocation;
    private Favourite testFavourite;
    private Location anotherLocation;
    private Favourite anotherFavourite;

    @BeforeEach
    void setUp() {
        // Create test user
        testUser = createTestUser(1, "testuser", "test@example.com", "Test", "User");

        // Create test locations
        testLocation = createTestLocation(1, "Test Restaurant", "Great food place");
        anotherLocation = createTestLocation(2, "Another Restaurant", "Another great place");

        // Create test favourites
        testFavourite = new Favourite();
        testFavourite.setId(1);
        testFavourite.setUser(testUser);
        testFavourite.setLocation(testLocation);
        testFavourite.setLikedAt(LocalDateTime.now());

        anotherFavourite = new Favourite();
        anotherFavourite.setId(2);
        anotherFavourite.setUser(testUser);
        anotherFavourite.setLocation(anotherLocation);
        anotherFavourite.setLikedAt(LocalDateTime.now().minusHours(1));
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
        location.setLat(40.7589);
        location.setLng(-73.9851);
        location.setAddress("Test Address");
        location.setReview(4.5f);
        location.setNumReviews(100);
        location.setPrice(2);
        location.setIsRestaurant(true);
        location.setIsBar(false);
        location.setIsClub(false);
        location.setIsLandmark(false);
        location.setZone("Test Zone");
        return location;
    }

    @Test
    void whenGetFavouritesByUser_withValidUserId_thenReturnFavouritesList() {
        // Given
        List<Favourite> expectedFavourites = Arrays.asList(testFavourite, anotherFavourite);
        when(favouriteRepository.findByUser_Id(1)).thenReturn(expectedFavourites);

        // When
        List<Favourite> result = favouriteService.getFavouritesByUser(1);

        // Then
        assertNotNull(result);
        assertEquals(2, result.size());
        assertEquals(testFavourite.getId(), result.get(0).getId());
        assertEquals(anotherFavourite.getId(), result.get(1).getId());
        verify(favouriteRepository).findByUser_Id(1);
    }

    @Test
    void whenGetFavouritesByUser_withNoFavourites_thenReturnEmptyList() {
        // Given
        when(favouriteRepository.findByUser_Id(1)).thenReturn(Arrays.asList());

        // When
        List<Favourite> result = favouriteService.getFavouritesByUser(1);

        // Then
        assertNotNull(result);
        assertTrue(result.isEmpty());
        verify(favouriteRepository).findByUser_Id(1);
    }

    @Test
    void whenGetFavouritesByUser_withDifferentUserId_thenReturnCorrectFavourites() {
        // Given
        User anotherUser = createTestUser(2, "anotheruser", "another@example.com", "Another", "User");
        Favourite anotherUserFavourite = new Favourite();
        anotherUserFavourite.setId(3);
        anotherUserFavourite.setUser(anotherUser);
        anotherUserFavourite.setLocation(testLocation);

        when(favouriteRepository.findByUser_Id(2)).thenReturn(Arrays.asList(anotherUserFavourite));

        // When
        List<Favourite> result = favouriteService.getFavouritesByUser(2);

        // Then
        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals(anotherUserFavourite.getId(), result.get(0).getId());
        assertEquals(2, result.get(0).getUser().getId());
        verify(favouriteRepository).findByUser_Id(2);
    }

    @Test
    void whenAddFavourite_withValidUserAndLocation_thenReturnFavourite() {
        // Given
        when(favouriteRepository.findByUser_IdAndLocation_Id(1, 1)).thenReturn(Optional.empty());
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation));
        when(favouriteRepository.save(any(Favourite.class))).thenReturn(testFavourite);

        // When
        Favourite result = favouriteService.addFavourite(1, 1);

        // Then
        assertNotNull(result);
        assertEquals(testFavourite.getId(), result.getId());
        assertEquals(testUser.getId(), result.getUser().getId());
        assertEquals(testLocation.getId(), result.getLocation().getId());
        verify(favouriteRepository).findByUser_IdAndLocation_Id(1, 1);
        verify(userRepository).findById(1);
        verify(locationRepository).findById(1);
        verify(favouriteRepository).save(any(Favourite.class));
    }

    @Test
    void whenAddFavourite_withAlreadyFavouritedLocation_thenThrowException() {
        // Given
        when(favouriteRepository.findByUser_IdAndLocation_Id(1, 1)).thenReturn(Optional.of(testFavourite));

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class,
            () -> favouriteService.addFavourite(1, 1));
        assertEquals("Already favourited.", exception.getMessage());

        verify(favouriteRepository).findByUser_IdAndLocation_Id(1, 1);
        verify(userRepository, never()).findById(any());
        verify(locationRepository, never()).findById(any());
        verify(favouriteRepository, never()).save(any());
    }

    @Test
    void whenAddFavourite_withNonExistentUser_thenThrowException() {
        // Given
        when(favouriteRepository.findByUser_IdAndLocation_Id(999, 1)).thenReturn(Optional.empty());
        when(userRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class,
            () -> favouriteService.addFavourite(999, 1));
        assertEquals("User not found", exception.getMessage());

        verify(favouriteRepository).findByUser_IdAndLocation_Id(999, 1);
        verify(userRepository).findById(999);
        verify(locationRepository, never()).findById(any());
        verify(favouriteRepository, never()).save(any());
    }

    @Test
    void whenAddFavourite_withNonExistentLocation_thenThrowException() {
        // Given
        when(favouriteRepository.findByUser_IdAndLocation_Id(1, 999)).thenReturn(Optional.empty());
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(locationRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class,
            () -> favouriteService.addFavourite(1, 999));
        assertEquals("Location not found", exception.getMessage());

        verify(favouriteRepository).findByUser_IdAndLocation_Id(1, 999);
        verify(userRepository).findById(1);
        verify(locationRepository).findById(999);
        verify(favouriteRepository, never()).save(any());
    }

    @Test
    void whenRemoveFavourite_withExistingFavourite_thenDeleteFavourite() {
        // Given
        when(favouriteRepository.findByUser_IdAndLocation_Id(1, 1)).thenReturn(Optional.of(testFavourite));

        // When
        favouriteService.removeFavourite(1, 1);

        // Then
        verify(favouriteRepository).findByUser_IdAndLocation_Id(1, 1);
        verify(favouriteRepository).delete(testFavourite);
    }

    @Test
    void whenRemoveFavourite_withNonExistentFavourite_thenThrowException() {
        // Given
        when(favouriteRepository.findByUser_IdAndLocation_Id(1, 1)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class,
            () -> favouriteService.removeFavourite(1, 1));
        assertEquals("Cannot remove favourite: not found.", exception.getMessage());

        verify(favouriteRepository).findByUser_IdAndLocation_Id(1, 1);
        verify(favouriteRepository, never()).delete(any());
    }

    @Test
    void whenRemoveFavourite_withDifferentUserAndLocation_thenRemoveCorrectFavourite() {
        // Given
        when(favouriteRepository.findByUser_IdAndLocation_Id(1, 2)).thenReturn(Optional.of(anotherFavourite));

        // When
        favouriteService.removeFavourite(1, 2);

        // Then
        verify(favouriteRepository).findByUser_IdAndLocation_Id(1, 2);
        verify(favouriteRepository).delete(anotherFavourite);
    }

    @Test
    void whenAddFavourite_withValidParametersAndNewFavourite_thenCreateNewFavourite() {
        // Given
        Favourite newFavourite = new Favourite();
        newFavourite.setId(3);
        newFavourite.setUser(testUser);
        newFavourite.setLocation(anotherLocation);

        when(favouriteRepository.findByUser_IdAndLocation_Id(1, 2)).thenReturn(Optional.empty());
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(locationRepository.findById(2)).thenReturn(Optional.of(anotherLocation));
        when(favouriteRepository.save(any(Favourite.class))).thenReturn(newFavourite);

        // When
        Favourite result = favouriteService.addFavourite(1, 2);

        // Then
        assertNotNull(result);
        assertEquals(newFavourite.getId(), result.getId());
        assertEquals(testUser.getId(), result.getUser().getId());
        assertEquals(anotherLocation.getId(), result.getLocation().getId());
        verify(favouriteRepository).findByUser_IdAndLocation_Id(1, 2);
        verify(userRepository).findById(1);
        verify(locationRepository).findById(2);
        verify(favouriteRepository).save(any(Favourite.class));
    }

    @Test
    void whenGetFavouritesByUser_withMultipleFavourites_thenReturnAllFavourites() {
        // Given
        Favourite thirdFavourite = new Favourite();
        thirdFavourite.setId(3);
        thirdFavourite.setUser(testUser);
        thirdFavourite.setLocation(createTestLocation(3, "Third Restaurant", "Third place"));

        List<Favourite> allFavourites = Arrays.asList(testFavourite, anotherFavourite, thirdFavourite);
        when(favouriteRepository.findByUser_Id(1)).thenReturn(allFavourites);

        // When
        List<Favourite> result = favouriteService.getFavouritesByUser(1);

        // Then
        assertNotNull(result);
        assertEquals(3, result.size());
        assertTrue(result.stream().anyMatch(fav -> fav.getId().equals(1)));
        assertTrue(result.stream().anyMatch(fav -> fav.getId().equals(2)));
        assertTrue(result.stream().anyMatch(fav -> fav.getId().equals(3)));
        verify(favouriteRepository).findByUser_Id(1);
    }

    @Test
    void whenAddFavourite_thenFavouriteHasCorrectTimestamp() {
        // Given
        when(favouriteRepository.findByUser_IdAndLocation_Id(1, 1)).thenReturn(Optional.empty());
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation));
        when(favouriteRepository.save(any(Favourite.class))).thenAnswer(invocation -> {
            Favourite saved = invocation.getArgument(0);
            saved.setId(1);
            return saved;
        });

        // When
        Favourite result = favouriteService.addFavourite(1, 1);

        // Then
        assertNotNull(result);
        assertNotNull(result.getLikedAt());
        verify(favouriteRepository).save(any(Favourite.class));
    }
}