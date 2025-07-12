// react and routing components
import { useState, useEffect, useRef } from "react";
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

// Data and context
import mockVenues from "../data/mockVenues";
import { usePlan } from "../context/PlanContext";

// Utilities for directions and geo-calculations
import polyline from "@mapbox/polyline";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";

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

  const { plan } = usePlan();
  const { setFromPlan } = usePlan();

  const mapSectionRef = useRef(null);

  // Core app states
  const [selectedVenue, setSelectedVenue] = useState(selectedVenueFromState);
  const [zoneCenter, setZoneCenter] = useState(null);
  const [manualStart, setManualStart] = useState("");
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
  const [selectedTimestamp, setSelectedTimestamp] = useState(null);

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
      if (location.state?.fromPlan === true && plan.length > 0) {
        setVenues(plan);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch("http://localhost:8080/vibe/map-data");
        if (!res.ok) throw new Error("Server error on map-data fetch");
        const data = await res.json();
        setVenues(data.locations || []);
        const busynessObject = data.busyness || {};
        const busynessArray = Object.entries(busynessObject).map(
          ([locationId, busynessValue]) => ({
            LocationID: locationId,
            busyness: busynessValue,
          })
        );
        setBusynessData(busynessArray);
      } catch (err) {
        console.warn("Falling back to mock data due to fetch error:", err);
        setVenues(mockVenues);
        if (!selectedVenueFromState) setSelectedVenue(mockVenues[0]);
        setIsMock(true);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [fromPlan, plan, selectedVenueFromState]);

  // 4. Enrich venues with zone IDs once all data is loaded
  useEffect(() => {
    if (!zoneData || venues.length === 0) {
      if (location.state?.fromPlan === true && plan.length > 0) {
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
  }, [zoneData, venues, fromPlan, selectedVenue]);

  // 5. Generate dummy forecast data for the slider
  useEffect(() => {
    // Wait until the zone data is loaded before generating predictions
    if (!zoneData) {
      return;
    }

    const generateDummyPredictions = () => {
      // Filter features to get only Manhattan zones, matching the live data.
      const manhattanZoneIds = zoneData.features
        .filter((feature) => feature.properties.borough === "Manhattan")
        .map((feature) => feature.properties.LocationID);

      // If the filter fails (e.g., no 'borough' property), fallback to all zones to prevent a blank map.
      const zonesToUse =
        manhattanZoneIds.length > 0
          ? manhattanZoneIds
          : zoneData.features.map((f) => f.properties.LocationID);

      const timestamps = [
        "2025-07-04T18:00:00Z",
        "2025-07-04T19:00:00Z",
        "2025-07-04T20:00:00Z",
        "2025-07-04T21:00:00Z",
        "2025-07-04T22:00:00Z",
      ];

      // Generate predictions for every Manhattan zone
      return zonesToUse.map((zoneId) => ({
        LocationID: zoneId,
        predictions: timestamps.map((ts) => ({
          timestamp: ts,
          busyness: Math.random(),
        })),
      }));
    };

    const dummyData = generateDummyPredictions();
    setPredictionData(dummyData);
    if (dummyData.length > 0 && dummyData[0].predictions.length > 0) {
      setSelectedTimestamp(dummyData[0].predictions[0].timestamp);
    }
  }, [zoneData]); // Add zoneData as a dependency

  // Scroll to map when directions are shown
  useEffect(() => {
    if (showDirections && mapSectionRef.current) {
      mapSectionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [showDirections]);

  // Fetch walking directions using the Google Routes API
  // Improved handleGetDirections function with better error handling and coordinate format support
  const handleGetDirections = async () => {
    const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
    if (!GOOGLE_API_KEY) {
      console.error("❌ Google API key is missing.");
      alert("Directions cannot be loaded. Missing API key.");
      return;
    }

    const hasPlan = fromPlan && plan.length > 0;
    const destinationVenue = hasPlan ? plan[plan.length - 1] : selectedVenue;

    if (!destinationVenue) {
      console.error("❌ No destination venue selected.");
      alert("Please select a destination venue first.");
      return;
    }

    const start = userLocation || (hasPlan ? plan[0] : selectedVenue);

    if (!start) {
      console.error("❌ No starting location available.");
      alert("Please set a starting location first.");
      return;
    }

    // Helper function to normalize coordinate format
    const normalizeCoordinates = (location) => {
      if (!location) return null;

      // Handle both lat/lng and latitude/longitude formats
      const lat = location.lat || location.latitude;
      const lng = location.lng || location.longitude;

      if (typeof lat !== "number" || typeof lng !== "number") {
        console.error("❌ Invalid coordinate format:", location);
        return null;
      }

      return { lat, lng };
    };

    const normalizedStart = normalizeCoordinates(start);
    const normalizedDestination = normalizeCoordinates(destinationVenue);

    if (!normalizedStart || !normalizedDestination) {
      console.error("❌ Invalid coordinates for start or destination.");
      alert("Invalid location coordinates. Please check your selected venues.");
      return;
    }

    // Build the request payload
    const origin = {
      location: {
        latLng: {
          latitude: normalizedStart.lat,
          longitude: normalizedStart.lng,
        },
      },
    };

    const destination = {
      location: {
        latLng: {
          latitude: normalizedDestination.lat,
          longitude: normalizedDestination.lng,
        },
      },
    };

    // Handle intermediate waypoints for multi-stop plans
    const intermediates = hasPlan
      ? plan
          .slice(1, -1)
          .map((venue) => {
            const normalized = normalizeCoordinates(venue);
            if (!normalized) {
              console.warn("❌ Skipping invalid intermediate venue:", venue);
              return null;
            }
            return {
              location: {
                latLng: {
                  latitude: normalized.lat,
                  longitude: normalized.lng,
                },
              },
            };
          })
          .filter(Boolean) // Remove null entries
      : [];

    const requestBody = {
      origin,
      destination,
      travelMode,
      ...(intermediates.length > 0 && { intermediates }),
    };

    try {
      console.log("🚀 Fetching directions...", {
        travelMode,
        intermediatesCount: intermediates.length,
      });

      const response = await fetch(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
          method: "POST",
          headers: {
            "X-Goog-Api-Key": GOOGLE_API_KEY,
            "X-Goog-FieldMask":
              "routes.legs,routes.polyline.encodedPolyline,routes.duration,routes.distanceMeters",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          "❌ Google Directions API HTTP error:",
          response.status,
          errorText
        );
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      console.log("✅ Directions API response:", data);

      // Validate the response structure
      if (!data.routes || data.routes.length === 0) {
        console.error("❌ No routes found in API response:", data);
        throw new Error(
          "No routes found. Try a different travel mode or check your locations."
        );
      }

      const route = data.routes[0];
      const encoded = route.polyline?.encodedPolyline;

      if (!encoded) {
        console.error("❌ No encoded polyline in API response:", route);
        throw new Error("No route polyline data received from API.");
      }

      // Decode the polyline
      const decodedPath = polyline.decode(encoded);
      setDirectionsPolyline(decodedPath);
      setShowDirections(true);

      // Process turn-by-turn directions
      const steps = route.legs.flatMap((leg, legIndex) => {
        if (!leg.steps) return [];

        return leg.steps.map((step, stepIndex) => ({
          summary: `Leg ${legIndex + 1}, Step ${stepIndex + 1}`,
          instructions:
            step.navigationInstruction?.instructions ||
            step.localizedValues?.instruction?.text ||
            step.instruction ||
            "Continue forward",
          transitDetails: step.transitDetails || null,
          duration: step.duration || null,
          distance: step.distanceMeters || null,
        }));
      });

      setDirections(steps);

      // Log success info
      const totalDistance = route.distanceMeters
        ? `${Math.round((route.distanceMeters / 1000) * 100) / 100} km`
        : "Unknown";
      const totalDuration = route.duration
        ? `${Math.round(parseInt(route.duration.replace("s", "")) / 60)} min`
        : "Unknown";

      console.log(
        `✅ Directions loaded successfully! Distance: ${totalDistance}, Duration: ${totalDuration}`
      );
    } catch (err) {
      console.error("❌ Google Directions API failed:", err);

      // Provide more specific error messages
      if (err.message.includes("API request failed")) {
        alert(
          `Failed to load directions: ${err.message}\n\nThis might be due to:\n- Invalid API key\n- API quota exceeded\n- Network issues\n- Invalid coordinates`
        );
      } else if (err.message.includes("No routes found")) {
        alert(
          `No routes found between your locations.\n\nTry:\n- Checking if locations are accessible by ${travelMode.toLowerCase()}\n- Using a different travel mode\n- Verifying your start and end locations`
        );
      } else {
        alert(
          `An error occurred while loading directions: ${err.message}\n\nPlease try again or check the console for more details.`
        );
      }
    }
  };

  // Geocode manually input start address
  const handleGeocodeStart = async () => {
    if (!manualStart.trim()) return;
    const encoded = encodeURIComponent(manualStart.trim());
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}`
      );
      if (!res.ok)
        throw new Error(`Geocoding service failed: ${res.statusText}`);
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

  const toggleDirections = () => {
    if (showDirections) {
      setShowDirections(false);
    } else {
      handleGetDirections();
    }
  };

  // Refetch directions when mode changes (walk/ public transport)
  useEffect(() => {
    if (showDirections && directions.length > 0) {
      handleGetDirections();
    }
  }, [travelMode]);

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
          overflow: "hidden",
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
                flexDirection: "row",
                alignItems: "center",
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
              <Button
                onClick={handleGeocodeStart}
                sx={{
                  fontWeight: "bold",
                  textTransform: "uppercase",
                  background: "linear-gradient(to right, #3ABEFF, #FF4ECD)",
                  color: "#000",
                  px: 3,
                  py: 1.2,
                  borderRadius: "8px",
                  height: "40px",
                  "&:hover": {
                    background: "linear-gradient(to right, #FF4ECD, #3ABEFF)",
                  },
                }}
              >
                Set
              </Button>
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
                  mt: 2,
                  px: 1,
                }}
              >
                <ForecastSlider
                  timestamps={predictionData[0]?.predictions?.map(
                    (p) => p.timestamp
                  )}
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
            </Tabs>

            {/* Conditional View Content */}
            <Box
              sx={{
                flexGrow: 1,
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              {viewMode === "plan" &&
                (fromPlan ? (
                  <CompactPlanSummary />
                ) : (
                  selectedVenue && (
                    <VenueCard venue={selectedVenue} variant="compact" />
                  )
                ))}

              {viewMode === "saved" && (
                <CompactSavedPlans setViewMode={setViewMode} />
              )}

              {viewMode === "favourites" && (
                <Typography sx={{ color: "#888", mt: 2 }}>
                  You haven’t added any favourites yet.
                </Typography>
              )}
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
            plan={fromPlan ? enrichedVenues : plan}
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
