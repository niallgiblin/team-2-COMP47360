import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Box } from "@mui/material";
import PageWrapper from "../components/PageWrapper";
import VenueCard from "../components/VenueCard";
import DemoMap from "../components/DemoMap";
import mockVenues from "../data/mockVenues";

export default function MapView() {

  const location = useLocation();
  const selectedVenueFromState = location.state?.selectedVenue || null;

  // state for venue list
  const [venues, setVenues] = useState([]);
  
  // state for selected venue, displayed in the left panel
  const [selectedVenue, setSelectedVenue] = useState(selectedVenueFromState);
  
  // state to manage loading screen
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("http://localhost:8080/api/location");
        if (!res.ok) throw new Error("Server error");

        const data = await res.json();
        const normalizedData = data.map((v) => ({
          ...v,
          tags: Array.isArray(v.tags) ? v.tags : [], // <-- this ensures tags is always an array
        }));
        setVenues(normalizedData);
        if (!selectedVenueFromState) {
          setSelectedVenue(data[0]);
        }
      } catch (err) {
        console.warn('Falling back to mock data due to fetch error:', err);
  
        setVenues(mockVenues);
        if (!selectedVenueFromState) {
          setSelectedVenue(mockVenues[0]);
        }
  
        setIsMock(true);
      } finally {
        setLoading(false);
      }
    };
    

    fetchData();
  }, [selectedVenueFromState]);
  
  

  if (loading) {
    return (
      <PageWrapper>
        <p style={{ color: "white" }}>Loading venues...</p>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper fullWidth fullHeight>
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          height: 'calc(120vh - 64px)',
          border: "3px solid #822869",
          borderRadius: 2,
          overflow: "hidden",
          maxWidth: "1200px",
          mx: "auto",
          mb: 8,
        }}
      >
        {/* Left panel - venue details */}
        <Box
          sx={{
            width: { xs: "100%", md: "24%" },
            maxHeight: { xs: "60vh", md: "100%" },
            p: { xs: 1, md: 2 },
            pr: { xs: 1 },
            bgcolor: "#000000",
            overflowY: "auto",
          }}
        >
          {selectedVenue && <VenueCard venue={selectedVenue} />}
        </Box>

        {/* Right panel - map */}
        <Box
          sx={{
            flexGrow: 1,
            height: { xs: "300px", md: "calc(100vh - 32px)" },
            p: { xs: 1, md: 2 },
          }}
        >
          {isMock && (
            <Box sx={{ color: "orange", p: 1 }}>
              You are viewing mock venue data. Backend not connected.
            </Box>
          )}

          <DemoMap
            venues={venues}
            selectedVenue={selectedVenue}
            onSelectVenue={setSelectedVenue}
          />
        </Box>
      </Box>
    </PageWrapper>
  );
}
