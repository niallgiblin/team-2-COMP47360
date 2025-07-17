import { Box, Typography, Stack, Button } from '@mui/material';
import { usePlan } from '../context/PlanContext';
import { useNavigate } from 'react-router-dom';
import PlanDisplay from './PlanDisplay';

export default function SharedPlans() {
  const { sharedPlans, loadPlan, setFromPlan } = usePlan();
  const navigate = useNavigate();

  if (!sharedPlans || sharedPlans.length === 0) {
    return (
      <Typography 
        sx={{ mt: 4, 
        textAlign: "center", 
        color: "#888" 
        }}
        >
        No plans have been shared with you yet.
      </Typography>
    );
  }

  return (
    <Box>
      {/* Page Heading */}
      <Typography 
        variant="h6" 
        sx={{ 
            mb: 3, 
            fontWeight: "bold" 
        }}
     >
        Plans Shared With You
      </Typography>

      {/* Render each shared plan */}
      <Stack spacing={4}>
        {sharedPlans.map((item) => (
          <Box
            key={item.plan.id}
            sx={{
              backgroundColor: "#000",           
              borderRadius: 3,
              p: 3,
              border: "1px solid #900B6A",        
            }}
          >
            {/* Plan Header: Shared By + Timestamp */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 2,
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: "bold", color: "#3ABEFF" }}>
                Shared by @{item.sharedBy?.username || 'Unknown'}
              </Typography>
              <Typography variant="caption" sx={{ color: "#888" }}>
                Shared on {new Date(item.plan.createdAt).toLocaleString()}
              </Typography>
            </Box>

            {/* Plan name */}
            <Typography variant="h6" sx={{ fontWeight: "bold", mb: 1 }}>
              {item.plan.name}
            </Typography>

            {/* Display of the venues inside the shared plan */}
            <PlanDisplay venues={item.plan.venues} disableActions />

            {/* Action button to view on map */}
            <Stack direction="row" sx={{ mt: 3 }}>
              <Button
                    onClick={() => {
                        console.log("Button clicked");
                        loadPlan(item.plan.venues);
                        setFromPlan(true);
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
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
