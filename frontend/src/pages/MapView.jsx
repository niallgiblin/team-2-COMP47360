// main map view page
// can view a user's current plan, load a saved or shared plan, favourite venue
// displays colour-coded busyness zones

// react and routing components
import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Tabs, Tab } from '@mui/material';


// UI components from MUI
import {
  Box,
  Typography,
  Button,
  TextField,
  CircularProgress,
} from "@mui/material";

// App-specific components
import PageWrapper from "../components/PageWrapper";
import VenueCard from "../components/VenueCard";
import DemoMap from "../components/DemoMap";
import CompactPlanSummary from "../components/CompactPlanSummary";
import ForecastSlider from "../components/ForecastSlider";
import DirectionsSidebar from "../components/DirectionSidebar";
import CompactSavedPlans from '../components/CompactSavedPlans';
import CompactFavorites from '../components/CompactFavorites';
import SharedPlans from "../components/SharedPlans";
import CompactSharedPlans from "../components/CompactSharedPlans";

// Data and context
import mockVenues from "../data/mockVenues";
import { usePlan } from "../context/PlanContext";
import { useLike } from "../context/LikeContext";

// External libraries, utilities for directions and geo-calculations
import polyline from "@mapbox/polyline";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";
import { DateTime } from "luxon";

// function to generate forecast timestamps in NY time
const generateNext12Hours = () => {
  const timestamps = [];

  for (let i = 0; i < 12; i++) {
    const dt = DateTime.now().setZone("America/New_York").plus({ hours: i });
    timestamps.push(dt.toISO()); // ISO string in NY time
  }

  return timestamps;
};

// geocode address into lat/lng using nominatim
const geocodeAddress = async (address) => {
  const encoded = encodeURIComponent(address.trim());
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}`
    );
    if (!res.ok) throw new Error(`Geocoding failed: ${res.statusText}`);
    const results = await res.json();
    if (results.length > 0) {
      return {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon),
      };
    }
  } catch (err) {
    console.error("Geocoding error:", err);
  }
  return null;
};


// main component - renders map, venue cards, forecast slider
export default function MapView() {
  // Define tab styles
  const tabStyles = {
    textTransform: "uppercase",
    fontWeight: "bold",
    color: "#BBB",
    minWidth: 120,
    "&.Mui-selected": {
      background: "linear-gradient(to right, #3ABEFF, #FF4ECD)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "#FFF",
    },
    "&:focus": {
      outline: "none",
      border: "none",
    },
    borderLeft: "none",
    borderRight: "none",
  };

  // Get state from route (eg when coming from a plan)
  const location = useLocation();
  const selectedVenueFromState = location.state?.selectedVenue || null;
  const fromPlan = location.state?.fromPlan || false;  
  const { plan, addVenueToPlan } = usePlan();
  const { likedVenues, handleLike } = useLike();
  const { setFromPlan } = usePlan();
  const mapSectionRef = useRef(null);

  // --- state ---
  
  // Memoize timestamps once
  const forecastTimestamps = useMemo(() => generateNext12Hours(), []);

  // Use memoized timestamps to initialize
  const [selectedTimestamp, setSelectedTimestamp] = useState(forecastTimestamps[0]);

  // Core app states
  const [selectedVenue, setSelectedVenue] = useState(selectedVenueFromState);
  const [zoneCenter, setZoneCenter] = useState(null);
  const [manualStart, setManualStart] = useState("");
  const [manualDestination, setManualDestination] = useState("");
  const [userLocation, setUserLocation] = useState(null);

  // Reset map by fully refreshing the page, when button is clicked
  const [resetMapKey] = useState(0);
  const handleResetMap = () => {
    window.location.reload();
  };

  // State for venue data, loading, and map display
  const [venues, setVenues] = useState([]);
  const [enrichedVenues, setEnrichedVenues] = useState([]);
  const [zoneData, setZoneData] = useState(null);
  const [busynessData, setBusynessData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);

  // State for map mode (live vs. forecast)
  const [mode, setMode] = useState("live");
  const [predictionData, setPredictionData] = useState([]);

  // State for route directions
  const [travelMode, setTravelMode] = useState("WALK");
  const [directions, setDirections] = useState([]);
  const [showDirections, setShowDirections] = useState(false);
  const [directionsPolyline, setDirectionsPolyline] = useState([]);

  const [viewMode, setViewMode] = useState("plan");

  // Ensure fromPlan is only true if user navigated via route state
  useEffect(() => {
    const comingFromPlan = location.state?.fromPlan === true;
    setFromPlan(comingFromPlan);
  }, [location.state, setFromPlan]);


  // 1. Try to automatically retrieve user's geolocation
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
          console.warn("Geolocation failed or was denied:", error);
        }
      );
    }
  }, [userLocation]);

  // 2. Load zone polygons for map coloring
  useEffect(() => {
    const fetchZoneData = async () => {
      try {
        const response = await fetch("/manhattanZones.geojson");
        if (!response.ok) throw new Error("Failed to fetch zone data");
        const json = await response.json();
        setZoneData(json);
      } catch (err) {
        console.error("Error loading GeoJSON:", err);
        setIsMock(true); // Fallback if zones fail
      }
    };
    fetchZoneData();
  }, []);

  // 3. Fetch combined venues and busyness data from the backend
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // use plan directly if user came from plan route
      if (location.state?.fromPlan === true && plan.length > 0) {
        setVenues(plan);
        console.log('MapView plan:', plan);
        console.log('MapView venues:', plan);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/vibe/map-data`);
        if (!res.ok) throw new Error("Server error on map-data fetch");
        
        const data = await res.json();
        
        // load venues
        setVenues(data.locations || []);
        
        // format live busyness data
        const busynessObject = data.busyness || {};
        const busynessArray = Object.entries(busynessObject).map(
          ([locationId, busynessValue]) => ({
            LocationID: String(locationId).trim(), // normalize to string, trim whitespace
            busyness: busynessValue,
          })
        );
        setBusynessData(busynessArray);
      
      
        // Handle prediction (forecast) data if available
        if (Array.isArray(data.predictions) && data.predictions.length > 0) {
          setPredictionData(data.predictions);
          const first = data.predictions[0]?.predictions?.[0]?.timestamp;
          if (first) setSelectedTimestamp(first);
        } else {
          console.warn("No real prediction data returned from backend.");
        }
      } catch (err) {
        // Fallback to mock data
        console.warn("Falling back to mock data due to fetch error:", err);
        setVenues(mockVenues);
        if (!selectedVenueFromState) setSelectedVenue(mockVenues[0]);
        console.log("[MapView] setting selectedVenue from mock");
        setIsMock(true);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [fromPlan, plan, selectedVenueFromState, location.state?.fromPlan]);

  // 4. Enrich venues with zone IDs once all data is loaded
  useEffect(() => {
    if (!zoneData || venues.length === 0) {
      if (fromPlan && plan.length > 0) {
        setEnrichedVenues(plan);
      }
      return;
    }

    const enriched = venues.map((venue) => {
      if (typeof venue.lat !== "number" || typeof venue.lng !== "number")
        return venue;
      const venuePoint = turfPoint([venue.lng, venue.lat]);
      const matchingZone = zoneData.features.find((feature) =>
        booleanPointInPolygon(venuePoint, feature.geometry)
      );
      return {
        ...venue,
        zone: matchingZone ? matchingZone.properties.LocationID : null,
      };
    });
    setEnrichedVenues(enriched);
    if (!selectedVenueFromState && !selectedVenue && enriched.length > 0) {
      setSelectedVenue(enriched[0]);
    }
  }, [zoneData, venues, fromPlan, plan, selectedVenue, selectedVenueFromState]);


  // 5. Use real forecast data if available; otherwise, fallback to dummy
  useEffect(() => {
    if (!zoneData || predictionData.length > 0) return;

    const generateDummyPredictions = () => {
      // Filter features to get only Manhattan zones
      const manhattanZoneIds = zoneData.features
        .filter((feature) => feature.properties.borough === "Manhattan")
        .map((feature) => feature.properties.LocationID);

      const zonesToUse = manhattanZoneIds.length > 0
        ? manhattanZoneIds
        : zoneData.features.map((f) => f.properties.LocationID);

      return zonesToUse.map((zoneId) => ({
        LocationID: zoneId,
        predictions: forecastTimestamps.map((ts) => ({
          timestamp: ts,
          busyness: Math.random(),
        })),
      }));
    };

    // Fallback only when no real prediction data was loaded
    console.warn("No real forecast data found. Using dummy predictions.");
    const dummyData = generateDummyPredictions();
    setPredictionData(dummyData);
    if (dummyData.length > 0 && dummyData[0].predictions.length > 0) {
      setSelectedTimestamp(dummyData[0].predictions[0].timestamp);
    }
  }, [zoneData, forecastTimestamps, predictionData]);


  // Scroll to map when directions are shown
  useEffect(() => {
    if (showDirections && mapSectionRef.current) {
      mapSectionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [showDirections]);

  // Updated handleGetDirections function to handle TRANSIT mode with multiple stops
  const handleGetDirections = async () => {
    const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
    if (!GOOGLE_API_KEY) {
      console.error("❌ Google API key is missing.");
      alert("Directions cannot be loaded. Missing API key.");
      return;
    }

    const hasPlan = fromPlan && plan.length > 0;
    const planVenues = hasPlan ? plan : [];

    let start = null;
    let destination = null;

    // Determine Start Location
    if (userLocation) {
      start = userLocation;
    } else if (manualStart.trim()) {
      start = await geocodeAddress(manualStart);
      if (!start) {
        alert("Could not find the start location.");
        return;
      }
      setUserLocation(start); // cache it
    }

    // Determine Destination
    if (hasPlan) {
      destination = planVenues[planVenues.length - 1];
    } else if (manualDestination.trim()) {
      destination = await geocodeAddress(manualDestination);
      if (!destination) {
        alert("Could not find the destination.");
        return;
      }
    } else if (selectedVenue) {
      destination = selectedVenue;
    }

    if (!start || !destination) {
      alert("Start or destination is missing.");
      return;
    }

    try {
      let allDirections = [];
      let combinedPolyline = [];

      if (travelMode === "TRANSIT" && hasPlan && planVenues.length > 1) {
        const allStops = [
          { lat: start.lat, lng: start.lng, name: "Start" },
          ...planVenues.map((v) => ({
            lat: v.lat,
            lng: v.lng,
            name: v.name,
          })),
        ];

        for (let i = 0; i < allStops.length - 1; i++) {
          const origin = {
            location: { latLng: { latitude: allStops[i].lat, longitude: allStops[i].lng } },
          };
          const dest = {
            location: { latLng: { latitude: allStops[i + 1].lat, longitude: allStops[i + 1].lng } },
          };

          const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
            method: "POST",
            headers: {
              "X-Goog-Api-Key": GOOGLE_API_KEY,
              "X-Goog-FieldMask": "routes.legs,routes.polyline.encodedPolyline",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ origin, destination: dest, travelMode: "TRANSIT" }),
          });

          const data = await response.json();
          const route = data.routes?.[0];

          if (route?.polyline?.encodedPolyline) {
            combinedPolyline.push(...polyline.decode(route.polyline.encodedPolyline));
          }

          const steps = route?.legs?.flatMap((leg, stepIndex) =>
            leg.steps?.map((step) => ({
              summary: `${allStops[i].name} → ${allStops[i + 1].name}`,
              instructions: step.navigationInstruction?.instructions || step.text || "Continue",
              transitDetails: step.transitDetails || null,
            }))
          ) || [];

          allDirections.push(...steps);
        }
      } else {
        // WALK or single route
        const origin = { location: { latLng: { latitude: start.lat, longitude: start.lng } } };
        const dest = { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } };

        let intermediates = [];
        if (travelMode === "WALK" && hasPlan && planVenues.length > 2) {
          intermediates = planVenues.slice(1, -1).map((v) => ({
            location: { latLng: { latitude: v.lat, longitude: v.lng } },
          }));
        }

        const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
          method: "POST",
          headers: {
            "X-Goog-Api-Key": GOOGLE_API_KEY,
            "X-Goog-FieldMask": "routes.legs,routes.polyline.encodedPolyline",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            origin,
            destination: dest,
            intermediates,
            travelMode,
          }),
        });

        const data = await response.json();
        const route = data.routes?.[0];

        if (!route?.polyline?.encodedPolyline) {
          throw new Error("No encoded polyline in response.");
        }

        combinedPolyline = polyline.decode(route.polyline.encodedPolyline);

        const steps = route.legs.flatMap((leg, legIndex) =>
          leg.steps?.map((step, stepIndex) => ({
            summary: `Leg ${legIndex + 1}, Step ${stepIndex + 1}`,
            instructions: step.navigationInstruction?.instructions || step.text || "Continue",
            transitDetails: step.transitDetails || null,
          })) || []
        );

        allDirections = steps;
      }

      // Update UI
      setDirectionsPolyline(combinedPolyline);
      setDirections(allDirections);
      setShowDirections(true);
    } catch (err) {
      console.error("❌ Error fetching directions:", err);
      alert("Could not load directions.");
    }
  };

  const toggleDirections = () => {
    if (showDirections) {
      setShowDirections(false);
    } else {
      handleGetDirections();
    }
  };

  // Refetch directions when mode changes (walk/ public transport)
  useEffect(() => {
    if (!showDirections) return;

    const hasValidStart = userLocation || (fromPlan && plan.length > 0);
    const hasValidDestination = selectedVenue || (fromPlan && plan.length > 0);

    const venuesReady = fromPlan ? plan.length > 0 : selectedVenue;
    const zonesReady = zoneData !== null;
    const allReady =
      hasValidStart && hasValidDestination && venuesReady && zonesReady;

    if (allReady) {
      handleGetDirections();
    }
  }, [travelMode, showDirections, userLocation, selectedVenue, plan, zoneData]);

  if (loading) {
    return (
      <PageWrapper fullWidth fullHeight>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "80vh",
          }}
        >
          <CircularProgress />
          <Typography sx={{ ml: 2, color: "white" }}>
            Loading Map & Venues...
          </Typography>
        </Box>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper fullWidth fullHeight>
      {/* Mode Toggle */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 2,
          mt: 0,
          mb: 2,
        }}
      >
        <Typography
          sx={{
            color: "#fff",
          }}
        >
          Check Busyness Level:
        </Typography>
        <Button
          onClick={() => setMode("live")}
          sx={{
            fontWeight: "bold",
            textTransform: "uppercase",
            color: mode === "live" ? "#000" : "#FFFFFF",
            background:
              mode === "live"
                ? "linear-gradient(to right, #3ABEFF, #FF4ECD)"
                : "transparent",
            border: "1px solid #FF4ECD",
            px: 2,
            "&:hover": {
              background: "linear-gradient(to right, #3ABEFF, #FF4ECD)",
              color: "#000",
            },
          }}
        >
          Live
        </Button>
        <Button
          onClick={() => setMode("forecast")}
          sx={{
            fontWeight: "bold",
            textTransform: "uppercase",
            color: mode === "forecast" ? "#000" : "#FFFFFF",
            background:
              mode === "forecast"
                ? "linear-gradient(to right, #3ABEFF, #FF4ECD)"
                : "transparent",
            border: "1px solid #FF4ECD",
            px: 2,
            "&:hover": {
              background: "linear-gradient(to right, #3ABEFF, #FF4ECD)",
              color: "#000",
            },
          }}
        >
          Forecast
        </Button>
      </Box>

      {/* Main Content Area */}
      <Box
        sx={{
          border: "4px solid #900B6A",
          borderRadius: 4,
          backgroundColor: "#000",
          px: { xs: 1, md: 2 },
          mx: 0,
          mb: 5,
          overflowX: "hidden",
          overflowY: 'visible',
        }}
      >
        {/* Reset map button */}
        <Box
          sx={{
            textAlign: "left",
            mb: 1,
            pl: 2,
            mt: { xs: 2, lg: 3 },
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: "#ccc",
              textDecoration: "underline",
              cursor: "pointer",
              "&:hover": {
                color: "#fff",
              },
            }}
            onClick={handleResetMap}
          >
            Reset Map
          </Typography>
        </Box>

        {/* Top Section: Controls and Venue Info */}
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", lg: "row" },
            alignItems: "center",
            justifyContent: "space-between",
            maxWidth: "800px",
            px: 2,
            mb: 3,
            gap: 3,
            mt: { xs: 2, lg: -4 },
          }}
        >
          {/* Left: Start Location Input & Directions Button */}
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
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
                  "& .MuiInputBase-input": { color: "white" },
                  "& .MuiInputLabel-root": { color: "white" },
                  "& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline": {
                    borderColor: "white",
                  },
                  "&:hover .MuiOutlinedInput-notchedOutline": {
                    borderColor: "#ccc",
                  },
                  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                    borderColor: "#3ABEFF",
                  },
                }}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                size="small"
                label="Destination"
                placeholder="Enter destination address or venue"
                variant="outlined"
                value={manualDestination}
                onChange={(e) => setManualDestination(e.target.value)}
                sx={{
                  width: 280,
                  "& .MuiInputBase-input": { color: "white" },
                  "& .MuiInputLabel-root": { color: "white" },
                  "& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline": {
                    borderColor: "white",
                  },
                  "&:hover .MuiOutlinedInput-notchedOutline": {
                    borderColor: "#ccc",
                  },
                  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                    borderColor: "#3ABEFF",
                  },
                }}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
            {((fromPlan && (userLocation || plan.length > 0)) ||
              selectedVenue) && (
              <Button
                variant="contained"
                onClick={toggleDirections}
                sx={{
                  mt: 1,
                  background: showDirections
                    ? "linear-gradient(to right, #FF4ECD, #3ABEFF)"
                    : "linear-gradient(to right, #3ABEFF, #FF4ECD)",
                  color: "#000",
                  fontWeight: "bold",
                  px: 4,
                  py: 1.5,
                  borderRadius: 2,
                  "&:hover": {
                    background: "linear-gradient(to right, #FF4ECD, #3ABEFF)",
                  },
                }}
              >
                {showDirections ? "Hide Directions" : "Get Directions"}
              </Button>
            )}
            
          {/* Forecast Slider */}
          {mode === "forecast" && predictionData.length > 0 && (
            <Box
              sx={{
                width: "100%",
                maxWidth: "700px",
                mt: -1,
                mb: -5,
              }}
            >
              {/* Ensure the slider always reflects current time in NYC */}
              <ForecastSlider
                timestamps={forecastTimestamps}
                selectedTimestamp={selectedTimestamp}
                onChange={setSelectedTimestamp}
                mode={mode}
              />
            </Box>
          )}
        </Box>


          {/* Vertical Divider */}
          <Box
            sx={{
              display: { xs: "none", lg: "block" },
              width: "6px",
              height: "100%",
              minHeight: "300px", // ensures it doesn't collapse
              background:
                "linear-gradient(to bottom, rgba(255, 78, 205, 0) 0%, #900B6A 20%, #900B6A 80%, rgba(255, 78, 205, 0) 100%)",
              borderRadius: "3px",
              flexShrink: 0,
              alignSelf: "stretch",
              mx: 2,
            }}
          />

          {/* Right Panel with Toggle */}
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", lg: "row" },
              width: "100%",
              flexGrow: 1,
              mt: { xs: 2, md: 0 },
              gap: 2,
            }}
          >
            {/* Vertical Tabs */}
            <Tabs
              orientation="vertical"
              value={viewMode}
              onChange={(e, newValue) => setViewMode(newValue)}
              sx={{
                borderRight: "1px solid #333",
                minWidth: 140,
                display: { xs: "none", lg: "flex" },
                "& .MuiTabs-indicator": {
                  width: "3px",
                  background: "linear-gradient(to right, #3ABEFF, #FF4ECD)",
                },
              }}
            >
              <Tab label="Current Plan" value="plan" sx={tabStyles} />
              <Tab label="Saved Plans" value="saved" sx={tabStyles} />
              <Tab label="Favourites" value="favourites" sx={tabStyles} />
              <Tab label="Shared With Me" value="shared" sx={tabStyles} />
            </Tabs>

            {/* Horizontal Tabs on mobile only */}
            <Tabs
              value={viewMode}
              onChange={(e, newValue) => setViewMode(newValue)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                display: { xs: "flex", lg: "none" },
                borderBottom: "1px solid #333",
                mb: 2,
                "& .MuiTabs-indicator": {
                  height: "3px",
                  background: "linear-gradient(to right, #3ABEFF, #FF4ECD)",
                },
              }}
            >
              <Tab label="Current Plan" value="plan" sx={tabStyles} />
              <Tab label="Saved Plans" value="saved" sx={tabStyles} />
              <Tab label="Favourites" value="favourites" sx={tabStyles} />
              <Tab label="Shared With Me" value="shared" sx={tabStyles} />
            </Tabs>

          {/* Conditional View Content */}
          <Box 
            sx={{ 
              flexGrow: 1,
              minWidth: 0,
              overflow: 'hidden',
              }}
            >
            {viewMode === 'plan' && (
              fromPlan ? (
                <CompactPlanSummary />
              ) : (
                selectedVenue && (
                  <VenueCard
                    venue={selectedVenue}
                    variant="compact"
                    onAddToPlan={() => addVenueToPlan(selectedVenue)}
                    onLike={() => handleLike(selectedVenue)}
                    isLiked={likedVenues.some(
                      (v) => v.id === selectedVenue.id
                    )}
                  />
                )
              )
            )}

            {viewMode === 'saved' && <CompactSavedPlans setViewMode={setViewMode} />}

            {viewMode === 'favourites' && <CompactFavorites />}
            {viewMode === 'shared' && <CompactSharedPlans setViewMode={setViewMode} />}
          </Box>
          </Box>
        </Box>

        {/* Map Section */}
        <Box
          ref={mapSectionRef}
          sx={{
            minHeight: "550px",
            flexGrow: 1,
            width: "100%",
            position: "relative",
          }}
        >
          {isMock && (
            <Box
              sx={{
                color: "orange",
                p: 1,
                textAlign: "center",
                position: "absolute",
                top: 10,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 1001,
                background: "rgba(0,0,0,0.7)",
                borderRadius: 1,
              }}
            >
              You are viewing mock venue data. Backend not connected.
            </Box>
          )}
          <DemoMap
            venues={enrichedVenues}
            selectedVenue={selectedVenue}
            onSelectVenue={setSelectedVenue}
            fromPlan={fromPlan}
            busynessData={busynessData}
            zoneData={zoneData}
            userLocation={userLocation}
            mode={mode}
            predictionData={predictionData}
            selectedTimestamp={selectedTimestamp}
            plan={plan}
            routeCoords={directionsPolyline}
            showDirections={showDirections}
            resetMapKey={resetMapKey}
            zoneCenter={zoneCenter}
            setZoneCenter={setZoneCenter}
          />
          <DirectionsSidebar
            open={showDirections}
            onClose={() => setShowDirections(false)}
            directions={directions}
            travelMode={travelMode}
            setTravelMode={setTravelMode}
          />
        </Box>
      </Box>
    </PageWrapper>
  );
}
