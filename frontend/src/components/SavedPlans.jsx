import { Box, Typography, Stack, Button, Divider } from "@mui/material";
import { usePlan } from "../context/PlanContext";
import PlanDisplay from "./PlanDisplay";
import { useNavigate } from "react-router-dom";

export default function SavedPlans() {
  const { savedPlans, loadPlan, deletePlan } = usePlan();
  const navigate = useNavigate();

  // Fix: Check if savedPlans exists before accessing .length
  if (!savedPlans || savedPlans.length === 0) {
    return (
      <Typography sx={{ mt: 4, textAlign: "center", color: "#888" }}>
        You haven't saved any plans yet.
      </Typography>
    );
  }

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 3, fontWeight: "bold" }}>
        Your Saved Plans
      </Typography>

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
            {/* Top row: Plan name + timestamp */}
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

            {/* Fix: Pass both planName and venues props correctly */}
            <PlanDisplay planName={plan.name} venues={plan.venues} />

            {/* Buttons */}
            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
              <Button
                onClick={() => {
                  loadPlan(plan.venues); // Load saved plan venues into context
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
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
