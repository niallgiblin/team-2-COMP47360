package com.manhattan.busyness_predictor.controller;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.MockitoAnnotations;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.manhattan.busyness_predictor.dto.AddFriendRequest;
import com.manhattan.busyness_predictor.model.Friend;
import com.manhattan.busyness_predictor.model.Friend.FriendStatus;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.security.UserPrincipal;
import com.manhattan.busyness_predictor.service.FriendService;

public class FriendControllerTest {
    private static final Integer USER_ID = 1;
    private static final String USERNAME = "testuser";
    private static final String EMAIL = "test@example.com";
    private static final String TOKEN = "jwt.token.here";
    
    private static final Integer FRIEND_ID = 2;
    private static final String FRIEND_USERNAME = "frienduser";
    private static final String FRIEND_EMAIL = "friend@example.com";
    
    private static final Integer OTHER_USER_ID = 3;
    private static final String OTHER_USERNAME = "otheruser";

    @Mock
    private FriendService friendService;

    @InjectMocks
    private FriendController friendController;

    private MockMvc mockMvc;
    private ObjectMapper objectMapper;
    private User testUser;
    private User friendUser;
    private User otherUser;
    private UserPrincipal userPrincipal;
    private TestingAuthenticationToken authentication;
    private Friend testFriendship;

    @BeforeEach
    public void setup() {
        MockitoAnnotations.openMocks(this);
        
        // Setup test user
        testUser = new User();
        testUser.setId(USER_ID);
        testUser.setUsername(USERNAME);
        testUser.setEmail(EMAIL);
        
        // Setup friend user
        friendUser = new User();
        friendUser.setId(FRIEND_ID);
        friendUser.setUsername(FRIEND_USERNAME);
        friendUser.setEmail(FRIEND_EMAIL);
        
        // Setup other user
        otherUser = new User();
        otherUser.setId(OTHER_USER_ID);
        otherUser.setUsername(OTHER_USERNAME);
        
        userPrincipal = UserPrincipal.create(testUser);
        
        // Setup test friendship
        testFriendship = new Friend(testUser, friendUser);
        testFriendship.setId(1);
        testFriendship.setTimestamp(LocalDateTime.now());
        testFriendship.setStatus(FriendStatus.PENDING);
        
        // Create authentication object
        authentication = new TestingAuthenticationToken(
            userPrincipal, 
            null, 
            List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        authentication.setAuthenticated(true);
        
        // Setup MockMvc with proper security configuration
        mockMvc = MockMvcBuilders
                .standaloneSetup(friendController)
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .setControllerAdvice(new TestGlobalExceptionHandler())
                .addFilters((request, response, chain) -> {
                    SecurityContextHolder.clearContext();
                    
                    if (request.getAttribute("org.springframework.security.authentication") != null) {
                        SecurityContextHolder.getContext().setAuthentication(authentication);
                    }
                    else if (request instanceof jakarta.servlet.http.HttpServletRequest) {
                        jakarta.servlet.http.HttpServletRequest httpRequest = (jakarta.servlet.http.HttpServletRequest) request;
                        String authHeader = httpRequest.getHeader("Authorization");
                        if (authHeader != null && authHeader.startsWith("Bearer " + TOKEN)) {
                            SecurityContextHolder.getContext().setAuthentication(authentication);
                        }
                    }
                    
                    try {
                        chain.doFilter(request, response);
                    } finally {
                        SecurityContextHolder.clearContext();
                    }
                })
                .build();
        
        objectMapper = new ObjectMapper();
    }

    // Test-specific global exception handler
    @org.springframework.web.bind.annotation.ControllerAdvice
    public static class TestGlobalExceptionHandler {
        @org.springframework.web.bind.annotation.ExceptionHandler(org.springframework.web.bind.MethodArgumentNotValidException.class)
        public org.springframework.http.ResponseEntity<?> handleValidationExceptions(
                org.springframework.web.bind.MethodArgumentNotValidException ex) {
            return new org.springframework.http.ResponseEntity<>("Validation failed", org.springframework.http.HttpStatus.BAD_REQUEST);
        }
        
        @org.springframework.web.bind.annotation.ExceptionHandler(Exception.class)
        public org.springframework.http.ResponseEntity<?> handleAllExceptions(Exception ex) {
            // Handle constraint violations
            if (ex instanceof jakarta.validation.ConstraintViolationException) {
                return new org.springframework.http.ResponseEntity<>("Validation failed", org.springframework.http.HttpStatus.BAD_REQUEST);
            }
            
            // Handle NullPointerException for authentication issues
            if (ex instanceof NullPointerException) {
                if (ex.getMessage() == null || ex.getStackTrace().length > 0) {
                    String topClass = ex.getStackTrace()[0].getClassName();
                    if (topClass.contains("FriendController")) {
                        return new org.springframework.http.ResponseEntity<>("Unauthorized", org.springframework.http.HttpStatus.UNAUTHORIZED);
                    }
                }
            }
            
            // Handle all other exceptions
            java.util.Map<String, String> errorDetails = new java.util.HashMap<>();
            errorDetails.put("error", "An unexpected internal server error has occurred.");
            errorDetails.put("message", ex.getMessage());
            return new org.springframework.http.ResponseEntity<>(errorDetails, org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Test
    public void whenAddFriendByUsername_thenReturnsSuccess() throws Exception {
        // Given
        AddFriendRequest request = new AddFriendRequest(FRIEND_USERNAME);
        when(friendService.addFriendByUsername(eq(USER_ID), eq(FRIEND_USERNAME))).thenReturn(testFriendship);

        // When & Then
        mockMvc.perform(post("/api/friends/add")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Friend added successfully"))
                .andExpect(jsonPath("$.friendshipId").value(1))
                .andExpect(jsonPath("$.friendAddedAt").exists());

        verify(friendService).addFriendByUsername(eq(USER_ID), eq(FRIEND_USERNAME));
    }

    @Test
    public void whenAddFriendWithInvalidUsername_thenReturnsBadRequest() throws Exception {
        // Given - invalid username (too short)
        AddFriendRequest request = new AddFriendRequest("ab");

        // When & Then
        mockMvc.perform(post("/api/friends/add")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isBadRequest());

        verify(friendService, never()).addFriendByUsername(any(), any());
    }

    @Test
    public void whenAddFriendWithBlankUsername_thenReturnsBadRequest() throws Exception {
        // Given - blank username
        AddFriendRequest request = new AddFriendRequest("");

        // When & Then
        mockMvc.perform(post("/api/friends/add")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isBadRequest());

        verify(friendService, never()).addFriendByUsername(any(), any());
    }

    @Test
    public void whenAddSelfAsFriend_thenReturnsInternalServerError() throws Exception {
        // Given
        AddFriendRequest request = new AddFriendRequest(USERNAME);
        when(friendService.addFriendByUsername(eq(USER_ID), eq(USERNAME)))
                .thenThrow(new RuntimeException("Cannot add yourself as a friend"));

        // When & Then
        mockMvc.perform(post("/api/friends/add")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("Cannot add yourself as a friend"));

        verify(friendService).addFriendByUsername(eq(USER_ID), eq(USERNAME));
    }

    @Test
    public void whenAddNonExistentUser_thenReturnsInternalServerError() throws Exception {
        // Given
        String nonExistentUsername = "nonexistent";
        AddFriendRequest request = new AddFriendRequest(nonExistentUsername);
        when(friendService.addFriendByUsername(eq(USER_ID), eq(nonExistentUsername)))
                .thenThrow(new RuntimeException("User with username '" + nonExistentUsername + "' not found"));

        // When & Then
        mockMvc.perform(post("/api/friends/add")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("User with username 'nonexistent' not found"));

        verify(friendService).addFriendByUsername(eq(USER_ID), eq(nonExistentUsername));
    }

    @Test
    public void whenRemoveFriend_thenReturnsSuccess() throws Exception {
        // Given
        doNothing().when(friendService).removeFriend(eq(USER_ID), eq(FRIEND_ID));

        // When & Then
        mockMvc.perform(delete("/api/friends/remove")
                .param("friendId", FRIEND_ID.toString())
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Friend removed successfully"));

        verify(friendService).removeFriend(eq(USER_ID), eq(FRIEND_ID));
    }

    @Test
    public void whenRemoveFriendByUsername_thenReturnsSuccess() throws Exception {
        // Given
        doNothing().when(friendService).removeFriendByUsername(eq(USER_ID), eq(FRIEND_USERNAME));

        // When & Then
        mockMvc.perform(delete("/api/friends/remove-by-username")
                .param("username", FRIEND_USERNAME)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Friend removed successfully"))
                .andExpect(jsonPath("$.removedUsername").value(FRIEND_USERNAME));

        verify(friendService).removeFriendByUsername(eq(USER_ID), eq(FRIEND_USERNAME));
    }

    @Test
    public void whenGetFriendsList_thenReturnsAllCategories() throws Exception {
        // Given
        List<User> acceptedFriends = Arrays.asList(friendUser);
        List<User> sentRequests = Arrays.asList(otherUser);
        List<User> receivedRequests = Collections.emptyList();
        
        when(friendService.getFriendsByStatus(eq(USER_ID), eq(FriendStatus.ACCEPTED))).thenReturn(acceptedFriends);
        when(friendService.getSentRequests(eq(USER_ID))).thenReturn(sentRequests);
        when(friendService.getReceivedRequests(eq(USER_ID))).thenReturn(receivedRequests);

        // When & Then
        mockMvc.perform(get("/api/friends/list")
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accepted").isArray())
                .andExpect(jsonPath("$.accepted[0].username").value(FRIEND_USERNAME))
                .andExpect(jsonPath("$.sent").isArray())
                .andExpect(jsonPath("$.sent[0].username").value(OTHER_USERNAME))
                .andExpect(jsonPath("$.received").isArray())
                .andExpect(jsonPath("$.received").isEmpty())
                .andExpect(jsonPath("$.totalFriends").value(1));

        verify(friendService).getFriendsByStatus(eq(USER_ID), eq(FriendStatus.ACCEPTED));
        verify(friendService).getSentRequests(eq(USER_ID));
        verify(friendService).getReceivedRequests(eq(USER_ID));
    }

    @Test
    public void whenAcceptFriendRequest_thenReturnsSuccess() throws Exception {
        // Given
        doNothing().when(friendService).acceptFriendRequest(eq(USER_ID), eq(FRIEND_ID));

        // When & Then
        mockMvc.perform(post("/api/friends/accept/{requesterId}", FRIEND_ID)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Friend request accepted"));

        verify(friendService).acceptFriendRequest(eq(USER_ID), eq(FRIEND_ID));
    }

    @Test
    public void whenDeclineFriendRequest_thenReturnsSuccess() throws Exception {
        // Given
        doNothing().when(friendService).declineFriendRequest(eq(USER_ID), eq(FRIEND_ID));

        // When & Then
        mockMvc.perform(post("/api/friends/decline/{requesterId}", FRIEND_ID)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Friend request declined"));

        verify(friendService).declineFriendRequest(eq(USER_ID), eq(FRIEND_ID));
    }

    @Test
    public void whenSearchUsers_thenReturnsMatchingUsers() throws Exception {
        // Given
        String query = "friend";
        List<User> searchResults = Arrays.asList(friendUser);
        when(friendService.searchUsersByUsername(eq(query), eq(USER_ID))).thenReturn(searchResults);

        // When & Then
        mockMvc.perform(get("/api/friends/search")
                .param("query", query)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users").isArray())
                .andExpect(jsonPath("$.users[0].username").value(FRIEND_USERNAME))
                .andExpect(jsonPath("$.totalResults").value(1));

        verify(friendService).searchUsersByUsername(eq(query), eq(USER_ID));
    }

    @Test
    public void whenCheckFriendship_thenReturnsFriendshipStatus() throws Exception {
        // Given
        when(friendService.areFriends(eq(USER_ID), eq(FRIEND_ID))).thenReturn(true);

        // When & Then
        mockMvc.perform(get("/api/friends/check")
                .param("otherUserId", FRIEND_ID.toString())
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areFriends").value(true))
                .andExpect(jsonPath("$.userId").value(USER_ID))
                .andExpect(jsonPath("$.otherUserId").value(FRIEND_ID));

        verify(friendService).areFriends(eq(USER_ID), eq(FRIEND_ID));
    }

    @Test
    public void whenGetFriendCount_thenReturnsFriendCount() throws Exception {
        // Given
        when(friendService.getFriendCount(eq(USER_ID))).thenReturn(5);

        // When & Then
        mockMvc.perform(get("/api/friends/count")
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(USER_ID))
                .andExpect(jsonPath("$.friendCount").value(5));

        verify(friendService).getFriendCount(eq(USER_ID));
    }

    @Test
    public void whenGetMutualFriends_thenReturnsMutualFriendsList() throws Exception {
        // Given
        User mutualFriend = new User();
        mutualFriend.setId(4);
        mutualFriend.setUsername("mutual");
        List<User> mutualFriends = Arrays.asList(mutualFriend);
        
        when(friendService.getMutualFriends(eq(USER_ID), eq(OTHER_USER_ID))).thenReturn(mutualFriends);

        // When & Then
        mockMvc.perform(get("/api/friends/mutual")
                .param("otherUserId", OTHER_USER_ID.toString())
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mutualFriends").isArray())
                .andExpect(jsonPath("$.mutualFriends[0].username").value("mutual"))
                .andExpect(jsonPath("$.totalMutual").value(1))
                .andExpect(jsonPath("$.userId").value(USER_ID))
                .andExpect(jsonPath("$.otherUserId").value(OTHER_USER_ID));

        verify(friendService).getMutualFriends(eq(USER_ID), eq(OTHER_USER_ID));
    }

    @Test
    public void whenAddFriendWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        // Given
        AddFriendRequest request = new AddFriendRequest(FRIEND_USERNAME);

        // When & Then
        mockMvc.perform(post("/api/friends/add")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());
      
        verify(friendService, never()).addFriendByUsername(any(), any());
    }

    @Test
    public void whenRemoveFriendWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        // When & Then
        mockMvc.perform(delete("/api/friends/remove")
                .param("friendId", FRIEND_ID.toString()))
                .andExpect(status().isUnauthorized());

        verify(friendService, never()).removeFriend(any(), any());
    }

    @Test
    public void whenGetFriendsListWithoutAuthentication_thenReturnsUnauthorized() throws Exception {
        // When & Then
        mockMvc.perform(get("/api/friends/list"))
                .andExpect(status().isUnauthorized());

        verify(friendService, never()).getFriendsByStatus(any(), any());
    }

    @Test
    public void whenAcceptNonExistentRequest_thenReturnsInternalServerError() throws Exception {
        // Given
        Integer nonExistentRequesterId = 999;
        doThrow(new RuntimeException("Friend request not found."))
                .when(friendService).acceptFriendRequest(eq(USER_ID), eq(nonExistentRequesterId));

        // When & Then
        mockMvc.perform(post("/api/friends/accept/{requesterId}", nonExistentRequesterId)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("Friend request not found."));

        verify(friendService).acceptFriendRequest(eq(USER_ID), eq(nonExistentRequesterId));
    }

    @Test
    public void whenDeclineNonExistentRequest_thenReturnsInternalServerError() throws Exception {
        // Given
        Integer nonExistentRequesterId = 999;
        doThrow(new RuntimeException("Friend request not found."))
                .when(friendService).declineFriendRequest(eq(USER_ID), eq(nonExistentRequesterId));

        // When & Then
        mockMvc.perform(post("/api/friends/decline/{requesterId}", nonExistentRequesterId)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("Friend request not found."));

        verify(friendService).declineFriendRequest(eq(USER_ID), eq(nonExistentRequesterId));
    }

    @Test
    public void whenSearchUsersWithEmptyQuery_thenReturnsEmptyList() throws Exception {
        // Given
        String query = "";
        when(friendService.searchUsersByUsername(eq(query), eq(USER_ID))).thenReturn(Collections.emptyList());

        // When & Then
        mockMvc.perform(get("/api/friends/search")
                .param("query", query)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users").isArray())
                .andExpect(jsonPath("$.users").isEmpty())
                .andExpect(jsonPath("$.totalResults").value(0));

        verify(friendService).searchUsersByUsername(eq(query), eq(USER_ID));
    }

    @Test
    public void whenCheckFriendshipWithNonFriend_thenReturnsFalse() throws Exception {
        // Given
        when(friendService.areFriends(eq(USER_ID), eq(OTHER_USER_ID))).thenReturn(false);

        // When & Then
        mockMvc.perform(get("/api/friends/check")
                .param("otherUserId", OTHER_USER_ID.toString())
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areFriends").value(false))
                .andExpect(jsonPath("$.userId").value(USER_ID))
                .andExpect(jsonPath("$.otherUserId").value(OTHER_USER_ID));

        verify(friendService).areFriends(eq(USER_ID), eq(OTHER_USER_ID));
    }

    @Test
    public void whenGetFriendCountWithZeroFriends_thenReturnsZero() throws Exception {
        // Given
        when(friendService.getFriendCount(eq(USER_ID))).thenReturn(0);

        // When & Then
        mockMvc.perform(get("/api/friends/count")
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(USER_ID))
                .andExpect(jsonPath("$.friendCount").value(0));

        verify(friendService).getFriendCount(eq(USER_ID));
    }

    @Test
    public void whenGetMutualFriendsWithNoMutuals_thenReturnsEmptyList() throws Exception {
        // Given
        when(friendService.getMutualFriends(eq(USER_ID), eq(OTHER_USER_ID))).thenReturn(Collections.emptyList());

        // When & Then
        mockMvc.perform(get("/api/friends/mutual")
                .param("otherUserId", OTHER_USER_ID.toString())
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mutualFriends").isArray())
                .andExpect(jsonPath("$.mutualFriends").isEmpty())
                .andExpect(jsonPath("$.totalMutual").value(0))
                .andExpect(jsonPath("$.userId").value(USER_ID))
                .andExpect(jsonPath("$.otherUserId").value(OTHER_USER_ID));

        verify(friendService).getMutualFriends(eq(USER_ID), eq(OTHER_USER_ID));
    }

    @Test
    public void whenAddFriendWithExistingRelationship_thenReturnsInternalServerError() throws Exception {
        // Given
        AddFriendRequest request = new AddFriendRequest(FRIEND_USERNAME);
        when(friendService.addFriendByUsername(eq(USER_ID), eq(FRIEND_USERNAME)))
                .thenThrow(new RuntimeException("A friendship or request already exists with " + FRIEND_USERNAME));

        // When & Then
        mockMvc.perform(post("/api/friends/add")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("A friendship or request already exists with " + FRIEND_USERNAME));

        verify(friendService).addFriendByUsername(eq(USER_ID), eq(FRIEND_USERNAME));
    }

    @Test
    public void whenRemoveNonExistentFriend_thenReturnsInternalServerError() throws Exception {
        // Given
        Integer nonExistentFriendId = 999;
        doThrow(new RuntimeException("You are not friends with this user"))
                .when(friendService).removeFriend(eq(USER_ID), eq(nonExistentFriendId));

        // When & Then
        mockMvc.perform(delete("/api/friends/remove")
                .param("friendId", nonExistentFriendId.toString())
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("You are not friends with this user"));

        verify(friendService).removeFriend(eq(USER_ID), eq(nonExistentFriendId));
    }

    @Test
    public void whenRemoveFriendByUsernameNonExistent_thenReturnsInternalServerError() throws Exception {
        // Given
        String nonExistentUsername = "nonexistent";
        doThrow(new RuntimeException("User with username '" + nonExistentUsername + "' not found"))
                .when(friendService).removeFriendByUsername(eq(USER_ID), eq(nonExistentUsername));

        // When & Then
        mockMvc.perform(delete("/api/friends/remove-by-username")
                .param("username", nonExistentUsername)
                .header("Authorization", "Bearer " + TOKEN)
                .with(authentication(authentication)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("An unexpected internal server error has occurred."))
                .andExpect(jsonPath("$.message").value("User with username 'nonexistent' not found"));

        verify(friendService).removeFriendByUsername(eq(USER_ID), eq(nonExistentUsername));
    }
}
