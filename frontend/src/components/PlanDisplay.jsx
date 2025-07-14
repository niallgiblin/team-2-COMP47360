// Component to display a saved plan, other plan summaries display plan from context
import { Box, Typography } from "@mui/material";
import VenueCard from "./VenueCard";

export default function PlanDisplay({ planName, venues, busynessMap }) {
  // Handle case where venues might be undefined or empty
  if (!venues || venues.length === 0) {
    return (
      <Box
        sx={{
          p: 2,
          backgroundColor: "#000",
        }}
      >
        {planName && (
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: "bold",
              color: "#fff",
              mb: 2,
            }}
          >
            {planName}
          </Typography>
        )}
        <Typography sx={{ color: "#888", fontStyle: "italic" }}>
          No venues in this plan
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: 2,
        backgroundColor: "#000",
      }}
    >
      {planName && (
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: "bold",
            color: "#fff",
            mb: 2,
          }}
        >
          {planName}
        </Typography>
      )}

      <Box
        sx={{
          display: "flex",
          overflowX: "auto",
          gap: 2,
        }}
      >
        {venues.map((venue) => (
          <VenueCard key={venue.id} venue={venue} variant="compact" busynessMap={busynessMap} tags={venue.tags} />
        ))}
      </Box>
    </Box>
  );
}
