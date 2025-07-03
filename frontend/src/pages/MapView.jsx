// react and routing components
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// UI components from MUI
import { Box, Typography, Button, TextField } from "@mui/material";

import PageWrapper from "../components/PageWrapper";
import VenueCard from "../components/VenueCard";
import DemoMap from "../components/DemoMap";
import mockVenues from "../data/mockVenues";
import { usePlan } from "../context/PlanContext";
import CompactPlanSummary from "../components/CompactPlanSummary";
import ForecastSlider from "../components/ForecastSlider";
import DirectionsSidebar from "../components/DirectionSidebar";

// decoding route polyline from Google Directions API
import polyline from '@mapbox/polyline';


export default function MapView() {
  const location = useLocation();
  const selectedVenueFromState = location.state?.selectedVenue || null;
  const fromPlan = location.state?.fromPlan || false;
  
  // Get the user's plan
  const { plan } = usePlan();

  // state for geolocation and manual input
  const [manualStart, setManualStart] = useState('');
  const [userLocation, setUserLocation] = useState(null);

  // try to automatically retrieve user's geolocation
  useEffect(() => {
    if (!userLocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.warn('Geolocation failed or was denied:', error);
        }
      );
    }
  }, [userLocation]);
  
  // state for venue data, loading status and mock fallback
  const [venues, setVenues] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState(selectedVenueFromState);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);

  // state for display mode and forecast data
  const [mode, setMode] = useState("forecast");
  const [predictionData, setPredictionData] = useState([]);
  const [selectedTimestamp, setSelectedTimestamp] = useState(null);

  // state for route directions and polyline
  const [directions, setDirections] = useState([]);
  const [showDirections, setShowDirections] = useState(false);
  const [directionsPolyline, setDirectionsPolyline] = useState([]);

  // Automatically fetch directions if accessed from a plan
  useEffect(() => {
    if (fromPlan && userLocation && plan.length > 0 && !showDirections) {
      handleGetDirections();
    }
  }, [fromPlan, userLocation, plan, showDirections]);

  // fetch walking directions using the Google Routes API
  const handleGetDirections = async () => {
    const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
  
    if (!GOOGLE_API_KEY) {
      console.error("❌ Google API key is missing. Check your .env or Docker environment.");
      alert("Directions cannot be loaded. Missing API key.");
      return;
    }
  
    if (!plan || plan.length === 0) {
      console.warn("⚠️ No venues in plan. Cannot compute directions.");
      return;
    }
  
    const start = userLocation || { lat: plan[0].lat, lng: plan[0].lng };
  
    // define origin, destination and intermediate stops
    const origin = {
      location: {
        latLng: {
          latitude: start.lat,
          longitude: start.lng
        }
      }
    };
  
    const destination = {
      location: {
        latLng: {
          latitude: plan[plan.length - 1].lat,
          longitude: plan[plan.length - 1].lng
        }
      }
    };
  
    const intermediates = plan.slice(1, -1).map(v => ({
      location: {
        latLng: {
          latitude: v.lat,
          longitude: v.lng
        }
      }
    }));
  
    try {
      const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "X-Goog-Api-Key": GOOGLE_API_KEY,
          "X-Goog-FieldMask": "routes.legs,routes.polyline.encodedPolyline",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin,
          destination,
          intermediates,
          travelMode: "WALK"
        }),
      });
  
      const data = await response.json();
  
      const encoded = data?.routes?.[0]?.polyline?.encodedPolyline;
      if (!encoded) {
        console.warn("No encoded polyline returned from Google");
        alert("Could not load route. Try again.");
        return;
      }
  
      // decode the encoded polyline into [lat, lng] path
      const decodedPath = polyline.decode(encoded); // [lat, lng] pairs
  
      setDirectionsPolyline(decodedPath);
      setShowDirections(true);
  
      const steps = data.routes[0].legs.flatMap((leg, i) =>
        leg.steps?.map((step, j) => ({
          summary: `Step ${i + 1}.${j + 1}`,
          instructions: step.navigationInstruction?.instructions || step.text || ""
        })) || []
      );
  
      setDirections(steps);
    } catch (err) {
      console.error("❌ Google Directions API failed:", err);
      alert("Failed to load directions. Check console for details.");
    }
  };

  const mapSectionRef = useRef(null);

  useEffect(() => {
    if (showDirections && mapSectionRef.current) {
      mapSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [showDirections]);
  
  
  // dummy forecast data
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

  // fetch venues from backend or fallback to mock data
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

  // handle geocoding for manually input start address
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

  // Toggle showing or hiding directions
  const toggleDirections = () => {
    if (showDirections) {
      setShowDirections(false);
    } else {
      handleGetDirections();
    }
  };

  // while loading, show placeholder
  if (loading) {
    return (
      <PageWrapper>
        <p style={{ color: "white" }}>Loading venues...</p>
      </PageWrapper>
    );
  }

  // main render
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
        <Typography sx={{ color: '#fff' }}>Check Busyness Level:</Typography>

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
                maxWidth: { xs: '100%', md: '700px'},
              }}
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

            {/* Get Directions Button */}
            <Box 
              sx={{ 
                display: 'flex', 
                justifyContent: 'center' 
              }}
            >
            {fromPlan && (userLocation || plan.length > 0) && (
              <Button
                variant="contained"
                onClick={toggleDirections}
                sx={{
                  mt: 2,
                  background: showDirections 
                    ? 'linear-gradient(to right, #FF4ECD, #3ABEFF)' 
                    : 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                  color: '#000',
                  fontWeight: 'bold',
                  px: 4,
                  py: 1.5,
                  borderRadius: 2,
                  alignSelf: 'center',
                  '&:hover': {
                    background: 'linear-gradient(to right, #FF4ECD, #3ABEFF)',
                  },
                }}
              >
                {showDirections ? 'Hide Directions' : 'Get Directions'}
              </Button>
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
              width: fromPlan ? '100%' : '100%',
              maxWidth: fromPlan ? 550 : 280,   // horizontal space for venue cards, 450: plan, 280: venue card
              flex: fromPlan ? 1.2 : 'initial',  // allow it to grow in horizontal space
              mt: { xs: 2, md: 0 },
              overflowX: fromPlan ? 'auto' : 'hidden', // enable scrolling if needed
              px: 0
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
          ref={mapSectionRef}
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
              showDirections={showDirections}
              plan={plan}
              routeCoords={directionsPolyline}
            />
            <DirectionsSidebar
              open={showDirections}
              onClose={() => setShowDirections(false)}
              directions={directions}
            />
          </Box>
        </Box>
  
    </PageWrapper>
  );
  
}