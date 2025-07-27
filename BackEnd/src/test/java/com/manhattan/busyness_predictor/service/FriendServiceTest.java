package com.manhattan.busyness_predictor.service;

import com.manhattan.busyness_predictor.model.Friend;
import com.manhattan.busyness_predictor.model.Friend.FriendStatus;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.FriendRepository;
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
class FriendServiceTest {

    @Mock
    private FriendRepository friendRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private FriendService friendService;

    private User currentUser;
    private User friendUser;
    private User otherUser;
    private Friend pendingFriendship;
    private Friend acceptedFriendship;

    @BeforeEach
    void setUp() {
        // Create test users
        currentUser = createTestUser(1, "currentuser", "current@example.com", "Current", "User");
        friendUser = createTestUser(2, "frienduser", "friend@example.com", "Friend", "User");
        otherUser = createTestUser(3, "otheruser", "other@example.com", "Other", "User");

        // Create test friendships
        pendingFriendship = new Friend(currentUser, friendUser);
        pendingFriendship.setId(1);
        pendingFriendship.setStatus(FriendStatus.PENDING);
        pendingFriendship.setTimestamp(LocalDateTime.now());

        acceptedFriendship = new Friend(currentUser, friendUser);
        acceptedFriendship.setId(2);
        acceptedFriendship.setStatus(FriendStatus.ACCEPTED);
        acceptedFriendship.setTimestamp(LocalDateTime.now());
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

    @Test
    void whenAddFriendByUsername_withValidUser_thenReturnFriend() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        when(userRepository.findByUsername("frienduser")).thenReturn(Optional.of(friendUser));
        when(friendRepository.findRelationshipBetweenUsers(currentUser, friendUser)).thenReturn(Optional.empty());
        when(friendRepository.save(any(Friend.class))).thenReturn(pendingFriendship);

        // When
        Friend result = friendService.addFriendByUsername(1, "frienduser");

        // Then
        assertNotNull(result);
        assertEquals(pendingFriendship.getId(), result.getId());
        verify(userRepository).findById(1);
        verify(userRepository).findByUsername("frienduser");
        verify(friendRepository).findRelationshipBetweenUsers(currentUser, friendUser);
        verify(friendRepository).save(any(Friend.class));
    }

    @Test
    void whenAddFriendByUsername_withNonExistentCurrentUser_thenThrowException() {
        // Given
        when(userRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> friendService.addFriendByUsername(999, "frienduser"));
        assertEquals("Authenticated user not found", exception.getMessage());

        verify(userRepository).findById(999);
        verify(friendRepository, never()).save(any());
    }

    @Test
    void whenAddFriendByUsername_withNonExistentFriend_thenThrowException() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        when(userRepository.findByUsername("nonexistent")).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> friendService.addFriendByUsername(1, "nonexistent"));
        assertEquals("User with username 'nonexistent' not found", exception.getMessage());

        verify(userRepository).findById(1);
        verify(userRepository).findByUsername("nonexistent");
        verify(friendRepository, never()).save(any());
    }

    @Test
    void whenAddFriendByUsername_withSelf_thenThrowException() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        when(userRepository.findByUsername("currentuser")).thenReturn(Optional.of(currentUser));

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> friendService.addFriendByUsername(1, "currentuser"));
        assertEquals("Cannot add yourself as a friend", exception.getMessage());

        verify(userRepository).findById(1);
        verify(userRepository).findByUsername("currentuser");
        verify(friendRepository, never()).save(any());
    }

    @Test
    void whenAddFriendByUsername_withExistingRelationship_thenThrowException() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        when(userRepository.findByUsername("frienduser")).thenReturn(Optional.of(friendUser));
        when(friendRepository.findRelationshipBetweenUsers(currentUser, friendUser)).thenReturn(Optional.of(pendingFriendship));

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> friendService.addFriendByUsername(1, "frienduser"));
        assertEquals("A friendship or request already exists with frienduser", exception.getMessage());

        verify(userRepository).findById(1);
        verify(userRepository).findByUsername("frienduser");
        verify(friendRepository).findRelationshipBetweenUsers(currentUser, friendUser);
        verify(friendRepository, never()).save(any());
    }

    @Test
    void whenRemoveFriend_withValidUsers_thenDeleteFriend() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        when(userRepository.findById(2)).thenReturn(Optional.of(friendUser));
        when(friendRepository.findRelationshipBetweenUsers(currentUser, friendUser)).thenReturn(Optional.of(acceptedFriendship));

        // When
        friendService.removeFriend(1, 2);

        // Then
        verify(userRepository).findById(1);
        verify(userRepository).findById(2);
        verify(friendRepository).findRelationshipBetweenUsers(currentUser, friendUser);
        verify(friendRepository).delete(acceptedFriendship);
    }

    @Test
    void whenRemoveFriend_withNonExistentUser_thenThrowException() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> friendService.removeFriend(1, 2));
        assertEquals("User not found", exception.getMessage());

        verify(userRepository).findById(1);
        verify(friendRepository, never()).delete(any());
    }

    @Test
    void whenRemoveFriend_withNoRelationship_thenThrowException() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        when(userRepository.findById(2)).thenReturn(Optional.of(friendUser));
        when(friendRepository.findRelationshipBetweenUsers(currentUser, friendUser)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> friendService.removeFriend(1, 2));
        assertEquals("You are not friends with this user", exception.getMessage());

        verify(friendRepository, never()).delete(any());
    }

    @Test
    void whenRemoveFriendByUsername_withValidUsername_thenRemoveFriend() {
        // Given
        when(userRepository.findByUsername("frienduser")).thenReturn(Optional.of(friendUser));
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        when(userRepository.findById(2)).thenReturn(Optional.of(friendUser));
        when(friendRepository.findRelationshipBetweenUsers(currentUser, friendUser)).thenReturn(Optional.of(acceptedFriendship));

        // When
        friendService.removeFriendByUsername(1, "frienduser");

        // Then
        verify(userRepository).findByUsername("frienduser");
        verify(friendRepository).delete(acceptedFriendship);
    }

    @Test
    void whenAcceptFriendRequest_withValidRequest_thenAcceptRequest() {
        // Given
        when(userRepository.findById(2)).thenReturn(Optional.of(friendUser)); // receiver
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser)); // requester
        when(friendRepository.findPendingRequest(currentUser, friendUser)).thenReturn(Optional.of(pendingFriendship));
        when(friendRepository.save(any(Friend.class))).thenReturn(acceptedFriendship);

        // When
        friendService.acceptFriendRequest(2, 1);

        // Then
        verify(userRepository).findById(2);
        verify(userRepository).findById(1);
        verify(friendRepository).findPendingRequest(currentUser, friendUser);
        verify(friendRepository).save(any(Friend.class));
    }

    @Test
    void whenAcceptFriendRequest_withNoRequest_thenThrowException() {
        // Given
        when(userRepository.findById(2)).thenReturn(Optional.of(friendUser));
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        when(friendRepository.findPendingRequest(currentUser, friendUser)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> friendService.acceptFriendRequest(2, 1));
        assertEquals("Friend request not found.", exception.getMessage());

        verify(friendRepository, never()).save(any());
    }

    @Test
    void whenDeclineFriendRequest_withValidRequest_thenDeleteRequest() {
        // Given
        when(userRepository.findById(2)).thenReturn(Optional.of(friendUser)); // receiver
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser)); // requester
        when(friendRepository.findPendingRequest(currentUser, friendUser)).thenReturn(Optional.of(pendingFriendship));

        // When
        friendService.declineFriendRequest(2, 1);

        // Then
        verify(userRepository).findById(2);
        verify(userRepository).findById(1);
        verify(friendRepository).findPendingRequest(currentUser, friendUser);
        verify(friendRepository).delete(pendingFriendship);
    }

    @Test
    void whenGetFriendsByStatus_withAcceptedStatus_thenReturnFriends() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        when(friendRepository.findByUserIdAndStatus(currentUser, FriendStatus.ACCEPTED))
                .thenReturn(Arrays.asList(acceptedFriendship));

        // When
        List<User> result = friendService.getFriendsByStatus(1, FriendStatus.ACCEPTED);

        // Then
        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals(friendUser.getId(), result.get(0).getId());
        verify(userRepository).findById(1);
        verify(friendRepository).findByUserIdAndStatus(currentUser, FriendStatus.ACCEPTED);
    }

    @Test
    void whenGetSentRequests_thenReturnSentRequests() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        when(friendRepository.findByRequesterAndStatus(currentUser, FriendStatus.PENDING))
                .thenReturn(Arrays.asList(pendingFriendship));

        // When
        List<User> result = friendService.getSentRequests(1);

        // Then
        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals(friendUser.getId(), result.get(0).getId());
        verify(userRepository).findById(1);
        verify(friendRepository).findByRequesterAndStatus(currentUser, FriendStatus.PENDING);
    }

    @Test
    void whenGetReceivedRequests_thenReturnReceivedRequests() {
        // Given
        Friend receivedRequest = new Friend(friendUser, currentUser); // friendUser sent request to currentUser
        receivedRequest.setStatus(FriendStatus.PENDING);
        
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        when(friendRepository.findByReceiverAndStatus(currentUser, FriendStatus.PENDING))
                .thenReturn(Arrays.asList(receivedRequest));

        // When
        List<User> result = friendService.getReceivedRequests(1);

        // Then
        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals(friendUser.getId(), result.get(0).getId());
        verify(userRepository).findById(1);
        verify(friendRepository).findByReceiverAndStatus(currentUser, FriendStatus.PENDING);
    }

    @Test
    void whenSearchUsersByUsername_thenReturnFilteredUsers() {
        // Given
        // Mock the first call to findById(1) in searchUsersByUsername method
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        
        // Mock the calls made by getFriendsByStatus, getSentRequests, getReceivedRequests
        // These methods will also call findById(1), so we need to account for all calls
        when(friendRepository.findByUserIdAndStatus(currentUser, FriendStatus.ACCEPTED)).thenReturn(Arrays.asList());
        when(friendRepository.findByRequesterAndStatus(currentUser, FriendStatus.PENDING)).thenReturn(Arrays.asList());
        when(friendRepository.findByReceiverAndStatus(currentUser, FriendStatus.PENDING)).thenReturn(Arrays.asList());
        when(userRepository.findAll()).thenReturn(Arrays.asList(currentUser, friendUser, otherUser));

        // When
        List<User> result = friendService.searchUsersByUsername("friend", 1);

        // Then
        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals("frienduser", result.get(0).getUsername());
        
        // The method calls findById(1) 4 times:
        // 1. In searchUsersByUsername method itself
        // 2. In getFriendsByStatus method
        // 3. In getSentRequests method 
        // 4. In getReceivedRequests method
        verify(userRepository, times(4)).findById(1);
        verify(userRepository).findAll();
    }

    @Test
    void whenAreFriends_withAcceptedFriendship_thenReturnTrue() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        when(userRepository.findById(2)).thenReturn(Optional.of(friendUser));
        when(friendRepository.findRelationshipBetweenUsers(currentUser, friendUser))
                .thenReturn(Optional.of(acceptedFriendship));

        // When
        boolean result = friendService.areFriends(1, 2);

        // Then
        assertTrue(result);
        verify(userRepository).findById(1);
        verify(userRepository).findById(2);
        verify(friendRepository).findRelationshipBetweenUsers(currentUser, friendUser);
    }

    @Test
    void whenAreFriends_withPendingFriendship_thenReturnFalse() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        when(userRepository.findById(2)).thenReturn(Optional.of(friendUser));
        when(friendRepository.findRelationshipBetweenUsers(currentUser, friendUser))
                .thenReturn(Optional.of(pendingFriendship));

        // When
        boolean result = friendService.areFriends(1, 2);

        // Then
        assertFalse(result);
    }

    @Test
    void whenAreFriends_withNonExistentUser_thenReturnFalse() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.empty());

        // When
        boolean result = friendService.areFriends(1, 2);

        // Then
        assertFalse(result);
        verify(userRepository).findById(1);
    }

    @Test
    void whenGetFriendCount_thenReturnCount() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        when(friendRepository.findByUserIdAndStatus(currentUser, FriendStatus.ACCEPTED))
                .thenReturn(Arrays.asList(acceptedFriendship));

        // When
        Integer result = friendService.getFriendCount(1);

        // Then
        assertEquals(1, result);
        verify(userRepository).findById(1);
        verify(friendRepository).findByUserIdAndStatus(currentUser, FriendStatus.ACCEPTED);
    }

    @Test
    void whenGetMutualFriends_thenReturnMutualFriends() {
        // Given
        User mutualFriend = createTestUser(4, "mutual", "mutual@example.com", "Mutual", "Friend");
        
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        when(userRepository.findById(2)).thenReturn(Optional.of(friendUser));
        
        // Mock that both users have the same mutual friend
        when(friendRepository.findByUserIdAndStatus(currentUser, FriendStatus.ACCEPTED))
                .thenReturn(Arrays.asList(new Friend(currentUser, mutualFriend)));
        when(friendRepository.findByUserIdAndStatus(friendUser, FriendStatus.ACCEPTED))
                .thenReturn(Arrays.asList(new Friend(friendUser, mutualFriend)));
        when(userRepository.findAllById(Arrays.asList(4))).thenReturn(Arrays.asList(mutualFriend));

        // When
        List<User> result = friendService.getMutualFriends(1, 2);

        // Then
        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals(mutualFriend.getId(), result.get(0).getId());
        verify(userRepository).findAllById(Arrays.asList(4));
    }

    @Test
    void whenGetSuggestedFriends_thenReturnSuggestions() {
        // Given
        User friendOfFriend = createTestUser(4, "suggested", "suggested@example.com", "Suggested", "Friend");
        
        when(userRepository.findById(1)).thenReturn(Optional.of(currentUser));
        when(userRepository.findById(2)).thenReturn(Optional.of(friendUser));
        
        // Mock that current user has friendUser as friend
        when(friendRepository.findByUserIdAndStatus(currentUser, FriendStatus.ACCEPTED))
                .thenReturn(Arrays.asList(new Friend(currentUser, friendUser)));
        // Mock that friendUser has friendOfFriend as friend
        when(friendRepository.findByUserIdAndStatus(friendUser, FriendStatus.ACCEPTED))
                .thenReturn(Arrays.asList(new Friend(friendUser, friendOfFriend)));
        when(userRepository.findAllById(Arrays.asList(4))).thenReturn(Arrays.asList(friendOfFriend));

        // When
        List<User> result = friendService.getSuggestedFriends(1, 5);

        // Then
        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals(friendOfFriend.getId(), result.get(0).getId());
        verify(userRepository).findAllById(Arrays.asList(4));
    }

    @Test
    void whenGetFriendsByStatus_withNonExistentUser_thenThrowException() {
        // Given
        when(userRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> friendService.getFriendsByStatus(999, FriendStatus.ACCEPTED));
        assertEquals("User not found", exception.getMessage());

        verify(userRepository).findById(999);
        verify(friendRepository, never()).findByUserIdAndStatus(any(), any());
    }
}