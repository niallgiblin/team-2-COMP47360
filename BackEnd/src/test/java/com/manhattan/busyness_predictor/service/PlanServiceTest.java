package com.manhattan.busyness_predictor.service;

import com.manhattan.busyness_predictor.dto.CreatePlanRequest;
import com.manhattan.busyness_predictor.dto.PlanResponse;
import com.manhattan.busyness_predictor.dto.SharedPlanResponse;
import com.manhattan.busyness_predictor.model.Location;
import com.manhattan.busyness_predictor.model.Plan;
import com.manhattan.busyness_predictor.model.PlanShared;
import com.manhattan.busyness_predictor.model.PlanVenue;
import com.manhattan.busyness_predictor.model.User;
import com.manhattan.busyness_predictor.repository.LocationRepository;
import com.manhattan.busyness_predictor.repository.PlanRepository;
import com.manhattan.busyness_predictor.repository.PlanSharedRepository;
import com.manhattan.busyness_predictor.repository.PlanVenueRepository;
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
class PlanServiceTest {

    @Mock
    private PlanRepository planRepository;

    @Mock
    private PlanVenueRepository planVenueRepository;

    @Mock
    private LocationRepository locationRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private PlanSharedRepository planSharedRepository;

    @InjectMocks
    private PlanService planService;

    private User testUser;
    private User otherUser;
    private Location testLocation1;
    private Location testLocation2;
    private Plan testPlan;
    private CreatePlanRequest createPlanRequest;

    @BeforeEach
    void setUp() {
        // Create test user
        testUser = new User();
        testUser.setId(1);
        testUser.setUsername("testuser");
        testUser.setFirstName("Test");
        testUser.setLastName("User");
        testUser.setEmail("test@example.com");

        // Create other user for sharing tests
        otherUser = new User();
        otherUser.setId(2);
        otherUser.setUsername("otheruser");
        otherUser.setFirstName("Other");
        otherUser.setLastName("User");
        otherUser.setEmail("other@example.com");

        // Create test locations
        testLocation1 = createTestLocation(1, "Test Restaurant", "Great food", 40.7589, -73.9851);
        testLocation2 = createTestLocation(2, "Test Bar", "Cool drinks", 40.7505, -73.9934);

        // Create test plan
        testPlan = new Plan();
        testPlan.setId(1);
        testPlan.setName("Weekend Plan");
        testPlan.setCreatedBy(testUser);
        testPlan.setCreatedAt(LocalDateTime.now());

        // Create plan venues
        PlanVenue venue1 = new PlanVenue(testPlan, testLocation1, 0);
        venue1.setId(1);
        PlanVenue venue2 = new PlanVenue(testPlan, testLocation2, 1);
        venue2.setId(2);
        testPlan.setVenues(Arrays.asList(venue1, venue2));

        // Create test request
        createPlanRequest = new CreatePlanRequest();
        createPlanRequest.setName("Weekend Plan");
        createPlanRequest.setLocationIds(Arrays.asList(1, 2));
    }

    private Location createTestLocation(Integer id, String name, String description, double lat, double lng) {
        Location location = new Location();
        location.setId(id);
        location.setName(name);
        location.setDescription(description);
        location.setLat(lat);
        location.setLng(lng);
        location.setAddress("Test Address " + id);
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
    void whenCreatePlan_withValidRequest_thenReturnPlanResponse() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(locationRepository.findAllById(Arrays.asList(1, 2))).thenReturn(Arrays.asList(testLocation1, testLocation2));
        when(planRepository.save(any(Plan.class))).thenReturn(testPlan);
        when(planVenueRepository.saveAll(any())).thenReturn(testPlan.getVenues());

        // When
        PlanResponse result = planService.createPlan(createPlanRequest, 1);

        // Then
        assertNotNull(result);
        assertEquals("Weekend Plan", result.getName());
        assertEquals(testPlan.getId(), result.getId());
        assertEquals(2, result.getVenues().size());
        assertEquals("Test Restaurant", result.getVenues().get(0).getName());
        assertEquals("Test Bar", result.getVenues().get(1).getName());

        verify(userRepository).findById(1);
        verify(locationRepository).findAllById(Arrays.asList(1, 2));
        verify(planRepository).save(any(Plan.class));
        verify(planVenueRepository).saveAll(any());
    }

    @Test
    void whenCreatePlan_withInvalidUser_thenThrowException() {
        // Given
        when(userRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> planService.createPlan(createPlanRequest, 999));
        assertEquals("User not found with ID: 999", exception.getMessage());
        
        verify(userRepository).findById(999);
        verify(planRepository, never()).save(any());
    }

    @Test
    void whenCreatePlan_withInvalidLocations_thenThrowException() {
        // Given
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(locationRepository.findAllById(Arrays.asList(1, 2))).thenReturn(Arrays.asList(testLocation1)); // Only return 1 location

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> planService.createPlan(createPlanRequest, 1));
        assertEquals("One or more venues were not found", exception.getMessage());
        
        verify(userRepository).findById(1);
        verify(locationRepository).findAllById(Arrays.asList(1, 2));
        verify(planRepository, never()).save(any());
    }

    @Test
    void whenGetAllPlansForUser_thenReturnUserPlans() {
        // Given
        List<Plan> userPlans = Arrays.asList(testPlan);
        when(planRepository.findByCreatedBy_IdOrderByCreatedAtDesc(1)).thenReturn(userPlans);

        // When
        List<PlanResponse> result = planService.getAllPlansForUser(1);

        // Then
        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals("Weekend Plan", result.get(0).getName());
        assertEquals(2, result.get(0).getVenues().size());
        
        verify(planRepository).findByCreatedBy_IdOrderByCreatedAtDesc(1);
    }

    @Test
    void whenGetAllPlansForUser_withNoPlans_thenReturnEmptyList() {
        // Given
        when(planRepository.findByCreatedBy_IdOrderByCreatedAtDesc(1)).thenReturn(Arrays.asList());

        // When
        List<PlanResponse> result = planService.getAllPlansForUser(1);

        // Then
        assertNotNull(result);
        assertTrue(result.isEmpty());
        
        verify(planRepository).findByCreatedBy_IdOrderByCreatedAtDesc(1);
    }

    @Test
    void whenGetPlanById_withValidIdAndOwner_thenReturnPlan() {
        // Given
        when(planRepository.findByIdAndCreatedBy_Id(1, 1)).thenReturn(Optional.of(testPlan));

        // When
        PlanResponse result = planService.getPlanById(1, 1);

        // Then
        assertNotNull(result);
        assertEquals("Weekend Plan", result.getName());
        assertEquals(testPlan.getId(), result.getId());
        assertEquals(2, result.getVenues().size());
        
        verify(planRepository).findByIdAndCreatedBy_Id(1, 1);
    }

    @Test
    void whenGetPlanById_withInvalidIdOrUser_thenThrowException() {
        // Given
        when(planRepository.findByIdAndCreatedBy_Id(999, 1)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> planService.getPlanById(999, 1));
        assertEquals("Plan not found or access denied", exception.getMessage());
        
        verify(planRepository).findByIdAndCreatedBy_Id(999, 1);
    }

    @Test
    void whenDeletePlan_withValidIdAndOwner_thenDeletePlan() {
        // Given
        when(planRepository.findByIdAndCreatedBy_Id(1, 1)).thenReturn(Optional.of(testPlan));

        // When
        planService.deletePlan(1, 1);

        // Then
        verify(planRepository).findByIdAndCreatedBy_Id(1, 1);
        verify(planRepository).delete(testPlan);
    }

    @Test
    void whenDeletePlan_withInvalidIdOrUser_thenThrowException() {
        // Given
        when(planRepository.findByIdAndCreatedBy_Id(999, 1)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> planService.deletePlan(999, 1));
        assertEquals("Plan not found or access denied", exception.getMessage());
        
        verify(planRepository).findByIdAndCreatedBy_Id(999, 1);
        verify(planRepository, never()).delete(any());
    }

    @Test
    void whenSharePlan_withValidPlanAndUsers_thenShareSuccessfully() {
        // Given
        List<Integer> userIds = Arrays.asList(2, 3);
        when(planRepository.findById(1)).thenReturn(Optional.of(testPlan));
        when(userRepository.findById(2)).thenReturn(Optional.of(otherUser));
        
        User thirdUser = new User();
        thirdUser.setId(3);
        when(userRepository.findById(3)).thenReturn(Optional.of(thirdUser));
        
        when(planSharedRepository.existsByPlanAndUser(testPlan, otherUser)).thenReturn(false);
        when(planSharedRepository.existsByPlanAndUser(testPlan, thirdUser)).thenReturn(false);

        // When
        planService.sharePlan(1, 1, userIds);

        // Then
        verify(planRepository).findById(1);
        verify(userRepository).findById(2);
        verify(userRepository).findById(3);
        verify(planSharedRepository).existsByPlanAndUser(testPlan, otherUser);
        verify(planSharedRepository).existsByPlanAndUser(testPlan, thirdUser);
        verify(planSharedRepository, times(2)).save(any(PlanShared.class));
    }

    @Test
    void whenSharePlan_withNonExistentPlan_thenThrowException() {
        // Given
        when(planRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> planService.sharePlan(999, 1, Arrays.asList(2)));
        assertEquals("Plan not found", exception.getMessage());
        
        verify(planRepository).findById(999);
        verify(planSharedRepository, never()).save(any());
    }

    @Test
    void whenSharePlan_withNonOwner_thenThrowException() {
        // Given
        when(planRepository.findById(1)).thenReturn(Optional.of(testPlan));

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> planService.sharePlan(1, 2, Arrays.asList(3))); // User 2 trying to share user 1's plan
        assertEquals("You can only share your own plans", exception.getMessage());
        
        verify(planRepository).findById(1);
        verify(planSharedRepository, never()).save(any());
    }

    @Test
    void whenSharePlan_withAlreadySharedUser_thenSkipDuplicate() {
        // Given
        List<Integer> userIds = Arrays.asList(2);
        when(planRepository.findById(1)).thenReturn(Optional.of(testPlan));
        when(userRepository.findById(2)).thenReturn(Optional.of(otherUser));
        when(planSharedRepository.existsByPlanAndUser(testPlan, otherUser)).thenReturn(true); // Already shared

        // When
        planService.sharePlan(1, 1, userIds);

        // Then
        verify(planSharedRepository).existsByPlanAndUser(testPlan, otherUser);
        verify(planSharedRepository, never()).save(any(PlanShared.class));
    }

    @Test
    void whenSharePlan_withSelfInList_thenSkipSelf() {
        // Given
        List<Integer> userIds = Arrays.asList(1, 2); // Including sender's own ID
        when(planRepository.findById(1)).thenReturn(Optional.of(testPlan));
        when(userRepository.findById(2)).thenReturn(Optional.of(otherUser));
        when(planSharedRepository.existsByPlanAndUser(testPlan, otherUser)).thenReturn(false);

        // When
        planService.sharePlan(1, 1, userIds);

        // Then
        verify(userRepository, never()).findById(1); // Should skip self
        verify(userRepository).findById(2);
        verify(planSharedRepository, times(1)).save(any(PlanShared.class)); // Only save for other user
    }

    @Test
    void whenGetPlansSharedWithUser_thenReturnSharedPlans() {
        // Given
        PlanShared planShared = new PlanShared();
        planShared.setPlan(testPlan);
        planShared.setUser(otherUser);
        
        when(userRepository.findById(2)).thenReturn(Optional.of(otherUser));
        when(planSharedRepository.findByUser(otherUser)).thenReturn(Arrays.asList(planShared));

        // When
        List<SharedPlanResponse> result = planService.getPlansSharedWithUser(2);

        // Then
        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals("Weekend Plan", result.get(0).getPlan().getName());
        assertEquals("Test", result.get(0).getSharedBy().getFirstName());
        assertEquals("testuser", result.get(0).getSharedBy().getUsername());
        
        verify(userRepository).findById(2);
        verify(planSharedRepository).findByUser(otherUser);
    }

    @Test
    void whenGetPlansSharedWithUser_withNoSharedPlans_thenReturnEmptyList() {
        // Given
        when(userRepository.findById(2)).thenReturn(Optional.of(otherUser));
        when(planSharedRepository.findByUser(otherUser)).thenReturn(Arrays.asList());

        // When
        List<SharedPlanResponse> result = planService.getPlansSharedWithUser(2);

        // Then
        assertNotNull(result);
        assertTrue(result.isEmpty());
        
        verify(userRepository).findById(2);
        verify(planSharedRepository).findByUser(otherUser);
    }

    @Test
    void whenGetPlansSharedWithUser_withInvalidUser_thenThrowException() {
        // Given
        when(userRepository.findById(999)).thenReturn(Optional.empty());

        // When & Then
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> planService.getPlansSharedWithUser(999));
        assertEquals("User not found", exception.getMessage());
        
        verify(userRepository).findById(999);
        verify(planSharedRepository, never()).findByUser(any());
    }

    @Test
    void whenCreatePlan_withEmptyLocationList_thenCreatePlanWithNoVenues() {
        // Given
        CreatePlanRequest emptyRequest = new CreatePlanRequest();
        emptyRequest.setName("Empty Plan");
        emptyRequest.setLocationIds(Arrays.asList());
        
        Plan emptyPlan = new Plan();
        emptyPlan.setId(2);
        emptyPlan.setName("Empty Plan");
        emptyPlan.setCreatedBy(testUser);
        emptyPlan.setCreatedAt(LocalDateTime.now());
        emptyPlan.setVenues(Arrays.asList());
        
        when(userRepository.findById(1)).thenReturn(Optional.of(testUser));
        when(locationRepository.findAllById(Arrays.asList())).thenReturn(Arrays.asList());
        when(planRepository.save(any(Plan.class))).thenReturn(emptyPlan);
        when(planVenueRepository.saveAll(any())).thenReturn(Arrays.asList());

        // When
        PlanResponse result = planService.createPlan(emptyRequest, 1);

        // Then
        assertNotNull(result);
        assertEquals("Empty Plan", result.getName());
        assertTrue(result.getVenues().isEmpty());
        
        verify(planVenueRepository).saveAll(any());
    }
}