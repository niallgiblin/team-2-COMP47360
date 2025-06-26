import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Box, Typography, Button } from "@mui/material";
import PageWrapper from "../components/PageWrapper";
import VenueCard from "../components/VenueCard";
import DemoMap from "../components/DemoMap";
import mockVenues from "../data/mockVenues";
import { usePlan } from "../context/PlanContext";
import CompactPlanSummary from "../components/CompactPlanSummary";
import ForecastSlider from "../components/ForecastSlider";

export default function MapView() {
  const location = useLocation();
  const selectedVenueFromState = location.state?.selectedVenue || null;
  const fromPlan = location.state?.fromPlan || false;
  const { plan } = usePlan();

  const [venues, setVenues] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState(selectedVenueFromState);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);

  // Slider-related state
  const [mode] = useState("forecast");
  
  const [predictionData, setPredictionData] = useState([]);
  const [selectedTimestamp, setSelectedTimestamp] = useState(null);

  // Dummy prediction data
  useEffect(() => {
    const dummy = [
      {
        LocationID: "zone_001",
        predictions: [
          { timestamp: "2025-06-23T18:00:00Z", busyness: 0.1 },
          { timestamp: "2025-06-23T19:00:00Z", busyness: 0.3 },
          { timestamp: "2025-06-23T20:00:00Z", busyness: 0.5 },
          { timestamp: "2025-06-23T21:00:00Z", busyness: 0.75 },
          { timestamp: "2025-06-23T22:00:00Z", busyness: 0.9 },
        ],
      },
    ];
    setPredictionData(dummy);
    setSelectedTimestamp(dummy[0].predictions[0].timestamp);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (fromPlan && plan.length > 0) {
        setVenues(plan);
        setSelectedVenue(plan[0]);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("http://localhost:8080/api/location");
        if (!res.ok) throw new Error("Server error");

        const data = await res.json();
        const normalizedData = data.map((v) => ({
          ...v,
          tags: Array.isArray(v.tags) ? v.tags : [],
        }));
        setVenues(normalizedData);
        if (!selectedVenueFromState) {
          setSelectedVenue(data[0]);
        }
      } catch (err) {
        console.warn("Falling back to mock data due to fetch error:", err);
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
  }, [fromPlan, plan, selectedVenueFromState]);

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
          flexDirection: "column",
          border: "3px solid #822869",
          borderRadius: 2,
          width: "100%",
          mx: "auto",
        }}
      >
        {/* Plan summary or selected venue */}
        <Box sx={{ px: 2, pt: 2 }}>
          {fromPlan ? (
            <CompactPlanSummary />
          ) : (
            selectedVenue && (
              <Box sx={{ maxWidth: 400, width: "100%", mx: "auto" }}>
                <VenueCard venue={selectedVenue} />
              </Box>
            )
          )}
        </Box>

        {/* Map */}
        <Box
          sx={{
            flexGrow: 1,
            width: "100%",
            p: { xs: 1, md: 2 },
            position: "relative",
            minHeight: "50vh",
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
            fromPlan={fromPlan}
            mode={mode}
            selectedTimestamp={selectedTimestamp}
            predictionData={predictionData}
          />
        </Box>

        {/* Controls and Forecast Slider */}
        <Box
          sx={{
            p: 1,
          }}
        >


          {/* Slider only in forecast mode */}
          {mode === "forecast" && predictionData.length > 0 && (
            <ForecastSlider
              timestamps={predictionData[0]?.predictions?.map((p) => p.timestamp)}
              selectedTimestamp={selectedTimestamp}
              onChange={setSelectedTimestamp}
            />
          )}

        </Box>
      </Box>
    </PageWrapper>
  );
}
