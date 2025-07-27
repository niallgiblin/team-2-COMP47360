package com.manhattan.busyness_predictor.service;

import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.Shared;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import com.manhattan.busyness_predictor.repository.SharedRepository;
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
class SharedServiceTest {

    @Mock
    private SharedRepository sharedRepository;

    @Mock
    private LocationRepository locationRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private SharedService sharedService;

    private User senderUser;
    private User receiverUser;
    private Location testLocation;
    private Shared testShared;

    @BeforeEach
    void setUp() {
        // Create test users
        senderUser = createTestUser(1, "sender", "sender@example.com", "Sender", "User");
        receiverUser = createTestUser(2, "receiver", "receiver@example.com", "Receiver", "User");

        // Create test location
        testLocation = createTestLocation(1, "Test Restaurant", "Great food place");

        // Create test shared
        testShared = new Shared();
        testShared.setId(1);
        testShared.setSender(senderUser);
        testShared.setReceiver(receiverUser);
        testShared.setLocation(testLocation);
        testShared.setSharedAt(LocalDateTime.now());
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
    void whenShareLocation_withValidParameters_thenSaveShared() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(senderUser));
        when(userRepository.findById(2)).thenReturn(Optional.of(receiverUser));
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation));
        when(sharedRepository.save(any(Shared.class))).thenReturn(testShared);

        // When
        sharedService.shareLocation(1, 2, 1);

        // Then
        verify(userRepository).findById(1);
        verify(userRepository).findById(2);
        verify(locationRepository).findById(1);
        verify(sharedRepository).save(any(Shared.class));
    }

    @Test
    void whenShareLocation_withNonExistentSender_thenThrowException() {
        // Given
        when(userRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> sharedService.shareLocation(999, 2, 1));
        assertEquals("Sender not found", exception.getMessage());

        verify(userRepository).findById(999);
        verify(sharedRepository, never()).save(any());
    }

    @Test
    void whenShareLocation_withNonExistentReceiver_thenThrowException() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(senderUser));
        when(userRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> sharedService.shareLocation(1, 999, 1));
        assertEquals("Receiver not found", exception.getMessage());

        verify(userRepository).findById(1);
        verify(userRepository).findById(999);
        verify(sharedRepository, never()).save(any());
    }

    @Test
    void whenShareLocation_withNonExistentLocation_thenThrowException() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(senderUser));
        when(userRepository.findById(2)).thenReturn(Optional.of(receiverUser));
        when(locationRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> sharedService.shareLocation(1, 2, 999));
        assertEquals("Location not found", exception.getMessage());

        verify(userRepository).findById(1);
        verify(userRepository).findById(2);
        verify(locationRepository).findById(999);
        verify(sharedRepository, never()).save(any());
    }

    @Test
    void whenShareLocation_withSameUserAsReceiver_thenThrowException() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(senderUser));
        when(userRepository.findById(1)).thenReturn(Optional.of(senderUser));
        when(locationRepository.findById(1)).thenReturn(Optional.of(testLocation));

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> sharedService.shareLocation(1, 1, 1));
        assertEquals("Cannot share a location with yourself.", exception.getMessage());

        verify(userRepository, times(2)).findById(1);
        verify(locationRepository).findById(1);
        verify(sharedRepository, never()).save(any());
    }

    @Test
    void whenGetSharedWithUser_withValidUser_thenReturnSharedList() {
        // Given
        List<Shared> expectedShares = Arrays.asList(testShared);
        when(userRepository.findById(2)).thenReturn(Optional.of(receiverUser));
        when(sharedRepository.findByReceiverOrderBySharedAtDesc(receiverUser)).thenReturn(expectedShares);

        // When
        List<Shared> result = sharedService.getSharedWithUser(2);

        // Then
        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals(testShared.getId(), result.get(0).getId());
        verify(userRepository).findById(2);
        verify(sharedRepository).findByReceiverOrderBySharedAtDesc(receiverUser);
    }

    @Test
    void whenGetSharedWithUser_withNonExistentUser_thenThrowException() {
        // Given
        when(userRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> sharedService.getSharedWithUser(999));
        assertEquals("User not found", exception.getMessage());

        verify(userRepository).findById(999);
        verify(sharedRepository, never()).findByReceiverOrderBySharedAtDesc(any());
    }

    @Test
    void whenGetSharedWithUser_withNoShares_thenReturnEmptyList() {
        // Given
        when(userRepository.findById(2)).thenReturn(Optional.of(receiverUser));
        when(sharedRepository.findByReceiverOrderBySharedAtDesc(receiverUser)).thenReturn(Arrays.asList());

        // When
        List<Shared> result = sharedService.getSharedWithUser(2);

        // Then
        assertNotNull(result);
        assertTrue(result.isEmpty());
        verify(userRepository).findById(2);
        verify(sharedRepository).findByReceiverOrderBySharedAtDesc(receiverUser);
    }

    @Test
    void whenGetSharedByUser_withValidUser_thenReturnSharedList() {
        // Given
        List<Shared> expectedShares = Arrays.asList(testShared);
        when(userRepository.findById(1)).thenReturn(Optional.of(senderUser));
        when(sharedRepository.findBySenderOrderBySharedAtDesc(senderUser)).thenReturn(expectedShares);

        // When
        List<Shared> result = sharedService.getSharedByUser(1);

        // Then
        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals(testShared.getId(), result.get(0).getId());
        verify(userRepository).findById(1);
        verify(sharedRepository).findBySenderOrderBySharedAtDesc(senderUser);
    }

    @Test
    void whenGetSharedByUser_withNonExistentUser_thenThrowException() {
        // Given
        when(userRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> sharedService.getSharedByUser(999));
        assertEquals("User not found", exception.getMessage());

        verify(userRepository).findById(999);
        verify(sharedRepository, never()).findBySenderOrderBySharedAtDesc(any());
    }

    @Test
    void whenGetSharedByUser_withNoShares_thenReturnEmptyList() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(senderUser));
        when(sharedRepository.findBySenderOrderBySharedAtDesc(senderUser)).thenReturn(Arrays.asList());

        // When
        List<Shared> result = sharedService.getSharedByUser(1);

        // Then
        assertNotNull(result);
        assertTrue(result.isEmpty());
        verify(userRepository).findById(1);
        verify(sharedRepository).findBySenderOrderBySharedAtDesc(senderUser);
    }

    @Test
    void whenGetSharedByUser_withMultipleShares_thenReturnOrderedList() {
        // Given
        Shared share1 = new Shared(senderUser, receiverUser, testLocation);
        share1.setId(1);
        share1.setSharedAt(LocalDateTime.now().minusHours(2));

        Shared share2 = new Shared(senderUser, receiverUser, testLocation);
        share2.setId(2);
        share2.setSharedAt(LocalDateTime.now().minusHours(1));

        List<Shared> expectedShares = Arrays.asList(share2, share1);

        when(userRepository.findById(1)).thenReturn(Optional.of(senderUser));
        when(sharedRepository.findBySenderOrderBySharedAtDesc(senderUser)).thenReturn(expectedShares);

        // When
        List<Shared> result = sharedService.getSharedByUser(1);

        // Then
        assertNotNull(result);
        assertEquals(2, result.size());
        assertEquals(share2.getId(), result.get(0).getId());
        assertEquals(share1.getId(), result.get(1).getId());
        verify(userRepository).findById(1);
        verify(sharedRepository).findBySenderOrderBySharedAtDesc(senderUser);
    }

    @Test
    void whenGetSharedWithUser_withMultipleShares_thenReturnOrderedList() {
        // Given
        Shared share1 = new Shared(senderUser, receiverUser, testLocation);
        share1.setId(1);
        share1.setSharedAt(LocalDateTime.now().minusHours(2));

        Shared share2 = new Shared(senderUser, receiverUser, testLocation);
        share2.setId(2);
        share2.setSharedAt(LocalDateTime.now().minusHours(1));

        List<Shared> expectedShares = Arrays.asList(share2, share1);

        when(userRepository.findById(2)).thenReturn(Optional.of(receiverUser));
        when(sharedRepository.findByReceiverOrderBySharedAtDesc(receiverUser)).thenReturn(expectedShares);

        // When
        List<Shared> result = sharedService.getSharedWithUser(2);

        // Then
        assertNotNull(result);
        assertEquals(2, result.size());
        assertEquals(share2.getId(), result.get(0).getId());
        assertEquals(share1.getId(), result.get(1).getId());
        verify(userRepository).findById(2);
        verify(sharedRepository).findByReceiverOrderBySharedAtDesc(receiverUser);
    }

    @Test
    void whenShareLocation_withValidParametersAndDifferentLocation_thenSaveShared() {
        // Given
        Location anotherLocation = createTestLocation(2, "Another Place", "Another great place");
        Shared anotherShared = new Shared(senderUser, receiverUser, anotherLocation);
        anotherShared.setId(2);

        when(userRepository.findById(1)).thenReturn(Optional.of(senderUser));
        when(userRepository.findById(2)).thenReturn(Optional.of(receiverUser));
        when(locationRepository.findById(2)).thenReturn(Optional.of(anotherLocation));
        when(sharedRepository.save(any(Shared.class))).thenReturn(anotherShared);

        // When
        sharedService.shareLocation(1, 2, 2);

        // Then
        verify(userRepository).findById(1);
        verify(userRepository).findById(2);
        verify(locationRepository).findById(2);
        verify(sharedRepository).save(any(Shared.class));
    }
}