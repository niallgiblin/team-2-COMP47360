// component to display a list of saved plans, created by the user
// used on the Profile.jsx page, under "Saved Plans" tab

// MUI components for layout and styling
import { Box, Typography, Stack, Button, Divider } from "@mui/material";

// Access saved plans, loading, and deletion functions from PlanContext
import { usePlan } from "../context/PlanContext";

// Access accepted friends list via context
import { useFriendRequests } from '../context/FriendRequestContext';

// Component to visually display a plan's contents
import PlanDisplay from "./PlanDisplay";

// For navigation between routes (e.g., redirecting to map view)
import { useNavigate } from "react-router-dom";

// React state and lifecycle hooks
import { useState } from 'react';

// Modal component to handle sharing a plan
import SharePlanModal from './SharePlanModal';

// Custom auth hook to make authenticated API calls
import { useAuth } from '../hooks/useAuth';


// Main component for displaying the user's saved plans
export default function SavedPlans() {
  // Access saved plans and plan-related actions from context
  const { savedPlans, loadPlan, deletePlan } = usePlan();

  // Hook for navigating to different pages
  const navigate = useNavigate();

  // Modal visibility toggle and selected plan to share
  const [openShareModal, setOpenShareModal] = useState(false);
  const [planToShare, setPlanToShare] = useState(null);

  // Authenticated fetch helper
  const { makeAuthenticatedRequest } = useAuth();

  // Pull the accepted friends list from context (used for sharing)
  const { acceptedFriends: friends } = useFriendRequests();

  // Sends a POST request to the backend to share a plan with a friend
  const sharePlanWithFriend = async (planId, friendId) => {
    await makeAuthenticatedRequest(`/api/plans/share`, {
      method: 'POST',
      body: JSON.stringify({ planId, userIds: [friendId] }),
    });
  };

  // Opens the modal and sets the selected plan
  const handleSharePlan = (plan) => {
    setPlanToShare(plan);
    setOpenShareModal(true);
  };

  // If there are no saved plans, render a friendly message
  if (savedPlans.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        You haven't saved any plans yet.
      </Typography>
    );
  }

  return (
    <Box>
      {/* Page Heading */}
      <Typography variant="h6" sx={{ mb: 3, fontWeight: "bold" }}>
        Your Saved Plans
      </Typography>

      {/* Render each saved plan in a styled box */}
      <Stack spacing={4}>
        {savedPlans.map((plan) => (
          <Box
            key={plan.id}
            sx={{
              backgroundColor: "#000",
              borderRadius: 3,
              p: 3,
              border: "1px solid #900B6A",
            }}
          >
            {/* Plan Header: Name + timestamp */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 2,
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                {plan.name}
              </Typography>
              <Typography variant="caption" sx={{ color: "#888" }}>
                Saved on {new Date(plan.createdAt).toLocaleString()}
              </Typography>
            </Box>

            {/* Display venues in the saved plan */}
            <PlanDisplay planName={plan.name} venues={plan.venues} hideTitle={true} />

            {/* Action buttons for each saved plan */}
            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
              
              {/* View plan on map */}
              <Button
                onClick={() => {
                  loadPlan(plan.venues);
                  navigate("/map", { state: { fromPlan: true } });
                }}
                variant="contained"
                sx={{
                  background: "linear-gradient(to right, #3ABEFF, #FF4ECD)",
                  fontWeight: "bold",
                  color: "#000",
                  textTransform: "none",
                }}
              >
                View on Map
              </Button>

              {/* Button to delete this saved plan */}
              <Button
                onClick={() => deletePlan(plan.id)}
                variant="outlined"
                sx={{
                  borderColor: "#FF4ECD",
                  color: "#FF4ECD",
                  fontWeight: "bold",
                  textTransform: "none",
                }}
              >
                Delete
              </Button>

              {/* Open the share modal */}
              <Button
                onClick={() => handleSharePlan(plan)}
                variant="outlined"
                sx={{
                  borderColor: '#3ABEFF',
                  color: '#3ABEFF',
                  fontWeight: 'bold',
                  textTransform: 'none',
                }}
              >
                Share
              </Button>
            </Stack>
          </Box>
        ))}
      </Stack>

      {/* Share modal for selecting a friend and confirming plan share */}
      <SharePlanModal
        open={openShareModal}
        onClose={() => setOpenShareModal(false)}
        plan={planToShare}
        friends={friends}
        onShare={sharePlanWithFriend}
      />
    </Box>
  );
}
