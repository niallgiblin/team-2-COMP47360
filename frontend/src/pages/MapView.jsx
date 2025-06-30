import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Box, Typography, Button, TextField } from "@mui/material";
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

  const [manualStart, setManualStart] = useState('');
  const [userLocation, setUserLocation] = useState(null);

  const [venues, setVenues] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState(selectedVenueFromState);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);

  const [mode, setMode] = useState("forecast");
  const [predictionData, setPredictionData] = useState([]);
  const [selectedTimestamp, setSelectedTimestamp] = useState(null);

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

  const handleGeocodeStart = async () => {
    if (!manualStart.trim()) return;
    const encoded = encodeURIComponent(manualStart.trim());

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encoded}`);
      if (!res.ok) {
        throw new Error(`Geocoding service failed: ${res.statusText}`);
      }
      const results = await res.json();

      if (results.length > 0) {
        const firstResult = results[0];
        setUserLocation({
          lat: parseFloat(firstResult.lat),
          lng: parseFloat(firstResult.lon),
        });
      } else {
        alert("Address not found. Try being more specific.");
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      alert("Failed to find location.");
    }
  };

  if (loading) {
    return (
      <PageWrapper>
        <p style={{ color: "white" }}>Loading venues...</p>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper fullWidth fullHeight>

      {/* Mode Toggle */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 2,
          mt: 0,
          mb: 2,
        }}
      >
        <Typography sx={{ color: '#fff' }}>Mode:</Typography>

        <Button
          onClick={() => setMode('live')}
          sx={{
            fontWeight: 'bold',
            textTransform: 'uppercase',
            color: mode === 'live' ? '#000' : '#FFFFFF',
            background:
              mode === 'live'
                ? 'linear-gradient(to right, #3ABEFF, #FF4ECD)'
                : 'transparent',
            border: '1px solid #FF4ECD',
            px: 2,
            '&:hover': {
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
              color: '#000',
            },
          }}
        >
          Live
        </Button>

        <Button
          onClick={() => setMode('forecast')}
          sx={{
            fontWeight: 'bold',
            textTransform: 'uppercase',
            color: mode === 'forecast' ? '#000' : '#FFFFFF',
            background:
              mode === 'forecast'
                ? 'linear-gradient(to right, #3ABEFF, #FF4ECD)'
                : 'transparent',
            border: '1px solid #FF4ECD',
            px: 2,
            '&:hover': {
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
              color: '#000',
            },
          }}
        >
          Forecast
        </Button>
      </Box>

      {/* Pink Container */}
      <Box
        sx={{
          border: '4px solid #900B6A',
          borderRadius: 4,
          backgroundColor: '#000',
          px: { xs: 1, md: 2 },
          py: 3,
          mx: 0,
          mb: 5,
          overflow: 'hidden',
        }}
      >
        {/* Location input + venue cards */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 3,
            mb: 5,
            gap: 3,
            flexWrap: 'nowrap',
          }}
        >
          {/* Left: Start Location input + button */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
            }}
          >
            {/* Manual Input and Set Start Button */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <TextField
                size="small"
                label="Start location"
                placeholder="Enter address or location"
                variant="outlined"
                value={manualStart}
                onChange={(e) => setManualStart(e.target.value)}
                sx={{
                  width: 280,
                  '& .MuiInputBase-input': { color: 'white' },
                  '& .MuiInputLabel-root': { color: 'white' },
                  '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': { borderColor: 'white' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#ccc' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#3ABEFF' },
                }}
                InputLabelProps={{ shrink: true }}
              />
              <Button
                onClick={handleGeocodeStart}
                sx={{
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                  color: '#000',
                  px: 3,
                  py: 1.2,
                  borderRadius: '8px',
                  height: '40px',
                  '&:hover': {
                    background: 'linear-gradient(to right, #FF4ECD, #3ABEFF)',
                  },
                }}
              >
                Set Start
              </Button>
            </Box>

            {/* Forecast Slider */}
            <Box 
              sx={{ 
                width: '100%', 
                maxWidth: { xs: '100%', md: '700px'  
                }}}
              >
              {mode === "forecast" && predictionData.length > 0 && (
                <ForecastSlider
                  timestamps={predictionData[0]?.predictions?.map((p) => p.timestamp)}
                  selectedTimestamp={selectedTimestamp}
                  onChange={setSelectedTimestamp}
                  mode={mode}
                />
              )}
            </Box>
          </Box>

    
            {/* Vertical Divider */}
            <Box
            sx={{
              display: { xs: 'none', md: 'block' },
              width: '6px',
              minWidth: '6px',
              alignSelf: 'stretch',
              background: `linear-gradient(to bottom, 
                rgba(255, 78, 205, 0) 0%, #900B6A 20%, #900B6A 80%, rgba(255, 78, 205, 0) 100%)`,
              borderRadius: '3px',
              mx: 2, // small horizontal space
            }}
            />
          
          {/* Right: Venue card(s) */}
          <Box 
            sx={{ 
              maxWidth: 280, 
              width: '100%',
              mt: { xs: 2, md: 0 }
            }}
          >
            {fromPlan ? (
              <CompactPlanSummary />
            ) : (
              selectedVenue && <VenueCard venue={selectedVenue} variant="map" />
            )}
          </Box>
        </Box>
        
        {/* Map */}
        <Box
          sx={{
            width: '100%',
            minHeight: '60vh',
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
              userLocation={userLocation}
            />
          </Box>
        </Box>
  
    </PageWrapper>
  );
  
}
