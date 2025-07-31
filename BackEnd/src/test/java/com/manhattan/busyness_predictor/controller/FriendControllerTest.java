package com.manhattan.busyness_predictor.controller;

import com.manhattan.busyness_predictor.dto.AddFriendRequest;
import com.manhattan.busyness_predictor.dto.UserDto;
import com.manhattan.busyness_predictor.model.Friend;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.security.UserPrincipal;
import com.manhattan.busyness_predictor.service.FriendService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(
    controllers = FriendController.class,
    excludeFilters = @ComponentScan.Filter(
        type = FilterType.ASSIGNABLE_TYPE,
        classes = {
            com.manhattan.busyness_predictor.security.JwtAuthenticationFilter.class,
            com.manhattan.busyness_predictor.security.JwtTokenProvider.class
        }
    )
)
class FriendControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private FriendService friendService;

    private UserPrincipal testUser;
    private User testUserModel;
    private User friendUser;
    private Friend testFriendship;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setup() {
        objectMapper = new ObjectMapper();
        
        // Setup test user
        testUserModel = new User();
        testUserModel.setId(1);
        testUserModel.setUsername("testuser");
        testUserModel.setEmail("test@example.com");
        testUser = UserPrincipal.create(testUserModel);
        
        // Setup friend user
        friendUser = new User();
        friendUser.setId(2);
        friendUser.setUsername("frienduser");
        friendUser.setEmail("friend@example.com");
        
        // Setup test friendship
        testFriendship = new Friend();
        testFriendship.setId(1);
        testFriendship.setRequester(testUserModel);
        testFriendship.setReceiver(friendUser);
        testFriendship.setStatus(Friend.FriendStatus.ACCEPTED);
        testFriendship.setTimestamp(LocalDateTime.now());
    }

    @Test
    void addFriendByUsername_ShouldAddFriend() throws Exception {
        // Given
        AddFriendRequest request = new AddFriendRequest();
        request.setUsername("frienduser");
        
        when(friendService.addFriendByUsername(1, "frienduser")).thenReturn(testFriendship);

        // When & Then
        mockMvc.perform(post("/api/friends/add")
                .with(user(testUser))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Friend added successfully"))
                .andExpect(jsonPath("$.friendshipId").value(1));

        verify(friendService).addFriendByUsername(1, "frienduser");
    }

    @Test
    void removeFriend_ShouldRemoveFriend() throws Exception {
        // Given
        doNothing().when(friendService).removeFriend(1, 2);

        // When & Then
        mockMvc.perform(delete("/api/friends/remove")
                .with(user(testUser))
                .param("friendId", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Friend removed successfully"));

        verify(friendService).removeFriend(1, 2);
    }

    @Test
    void removeFriendByUsername_ShouldRemoveFriend() throws Exception {
        // Given
        doNothing().when(friendService).removeFriendByUsername(1, "frienduser");

        // When & Then
        mockMvc.perform(delete("/api/friends/remove-by-username")
                .with(user(testUser))
                .param("username", "frienduser"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Friend removed successfully"))
                .andExpect(jsonPath("$.removedUsername").value("frienduser"));

        verify(friendService).removeFriendByUsername(1, "frienduser");
    }

    @Test
    void getFriendsList_ShouldReturnFriendsList() throws Exception {
        // Given
        List<UserDto> acceptedFriends = Arrays.asList(UserDto.fromUser(friendUser));
        List<UserDto> sentRequests = Arrays.asList();
        List<UserDto> receivedRequests = Arrays.asList();
        
        when(friendService.getFriendsByStatus(1, Friend.FriendStatus.ACCEPTED))
            .thenReturn(Arrays.asList(friendUser));
        when(friendService.getSentRequests(1)).thenReturn(Arrays.asList());
        when(friendService.getReceivedRequests(1)).thenReturn(Arrays.asList());

        // When & Then
        mockMvc.perform(get("/api/friends/list")
                .with(user(testUser)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accepted", hasSize(1)))
                .andExpect(jsonPath("$.sent", hasSize(0)))
                .andExpect(jsonPath("$.received", hasSize(0)))
                .andExpect(jsonPath("$.totalFriends").value(1));

        verify(friendService).getFriendsByStatus(1, Friend.FriendStatus.ACCEPTED);
        verify(friendService).getSentRequests(1);
        verify(friendService).getReceivedRequests(1);
    }

    @Test
    void acceptFriendRequest_ShouldAcceptRequest() throws Exception {
        // Given
        doNothing().when(friendService).acceptFriendRequest(1, 2);

        // When & Then
        mockMvc.perform(post("/api/friends/accept/2")
                .with(user(testUser)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Friend request accepted"));

        verify(friendService).acceptFriendRequest(1, 2);
    }

    @Test
    void declineFriendRequest_ShouldDeclineRequest() throws Exception {
        // Given
        doNothing().when(friendService).declineFriendRequest(1, 2);

        // When & Then
        mockMvc.perform(post("/api/friends/decline/2")
                .with(user(testUser)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Friend request declined"));

        verify(friendService).declineFriendRequest(1, 2);
    }

    @Test
    void searchUsers_ShouldReturnSearchResults() throws Exception {
        // Given
        List<User> searchResults = Arrays.asList(friendUser);
        when(friendService.searchUsersByUsername("friend", 1)).thenReturn(searchResults);

        // When & Then
        mockMvc.perform(get("/api/friends/search")
                .with(user(testUser))
                .param("query", "friend"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users", hasSize(1)))
                .andExpect(jsonPath("$.users[0].username").value("frienduser"));

        verify(friendService).searchUsersByUsername("friend", 1);
    }

    @Test
    void checkFriendship_ShouldReturnFriendshipStatus() throws Exception {
        // Given
        when(friendService.areFriends(1, 2)).thenReturn(true);

        // When & Then
        mockMvc.perform(get("/api/friends/check")
                .with(user(testUser))
                .param("otherUserId", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACCEPTED"));

        verify(friendService).areFriends(1, 2);
    }

    @Test
    void getFriendCount_ShouldReturnCount() throws Exception {
        // Given
        when(friendService.getFriendCount(1)).thenReturn(5);

        // When & Then
        mockMvc.perform(get("/api/friends/count")
                .with(user(testUser)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(5));

        verify(friendService).getFriendCount(1);
    }

    @Test
    void getMutualFriends_ShouldReturnMutualFriends() throws Exception {
        // Given
        List<User> mutualFriends = Arrays.asList(friendUser);
        when(friendService.getMutualFriends(1, 2)).thenReturn(mutualFriends);

        // When & Then
        mockMvc.perform(get("/api/friends/mutual")
                .with(user(testUser))
                .param("otherUserId", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mutualFriends", hasSize(1)));

        verify(friendService).getMutualFriends(1, 2);
    }

    @Test
    void addFriendByUsername_WithoutAuthentication_ShouldReturnUnauthorized() throws Exception {
        // Given
        AddFriendRequest request = new AddFriendRequest();
        request.setUsername("frienduser");

        // When & Then
        mockMvc.perform(post("/api/friends/add")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void addFriendByUsername_WithInvalidRequest_ShouldReturnBadRequest() throws Exception {
        // Given
        AddFriendRequest request = new AddFriendRequest();
        // Missing username

        // When & Then
        mockMvc.perform(post("/api/friends/add")
                .with(user(testUser))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }
} 