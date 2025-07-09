// react and routing components
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

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

// Data and context
import mockVenues from "../data/mockVenues";
import { usePlan } from "../context/PlanContext";

// Utilities for directions and geo-calculations
import polyline from "@mapbox/polyline";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";

export default function MapView() {
  
  // Get state from route (eg when coming from a plan)
  const location = useLocation();
  const selectedVenueFromState = location.state?.selectedVenue || null;
  const fromPlan = location.state?.fromPlan || false;

  const { plan } = usePlan();
  
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
  const [directions, setDirections] = useState([]);
  const [showDirections, setShowDirections] = useState(false);
  const [directionsPolyline, setDirectionsPolyline] = useState([]);

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
      if (fromPlan && plan.length > 0) {
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
      if (fromPlan) setEnrichedVenues(venues);
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
  const handleGetDirections = async () => {
    const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
    if (!GOOGLE_API_KEY) {
      console.error("❌ Google API key is missing.");
      alert("Directions cannot be loaded. Missing API key.");
      return;
    }

    const hasPlan = fromPlan && plan.length > 0;
    const destinationVenue = hasPlan ? plan[plan.length - 1] : selectedVenue;
    if (!destinationVenue) return;

    const start = userLocation || (hasPlan ? plan[0] : selectedVenue);
    const origin = {
      location: { latLng: { latitude: start.lat, longitude: start.lng } },
    };
    const destination = {
      location: {
        latLng: {
          latitude: destinationVenue.lat,
          longitude: destinationVenue.lng,
        },
      },
    };
    const intermediates = hasPlan
      ? plan.slice(1, -1).map((v) => ({
          location: { latLng: { latitude: v.lat, longitude: v.lng } },
        }))
      : [];

    try {
      const response = await fetch(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
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
            travelMode: "WALK",
          }),
        }
      );

      const data = await response.json();
      const encoded = data?.routes?.[0]?.polyline?.encodedPolyline;
      if (!encoded) throw new Error("No encoded polyline in API response");

      const decodedPath = polyline.decode(encoded);
      setDirectionsPolyline(decodedPath);
      setShowDirections(true);

      const steps = data.routes[0].legs.flatMap(
        (leg, i) =>
          leg.steps?.map((step, j) => ({
            summary: `Leg ${i + 1}, Step ${j + 1}`,
            instructions:
              step.navigationInstruction?.instructions || step.text || "",
          })) || []
      );
      setDirections(steps);
    } catch (err) {
      console.error("❌ Google Directions API failed:", err);
      alert("Failed to load directions. Check console for details.");
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
        <Typography sx={{ color: "#fff" }}>Check Busyness Level:</Typography>
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
          py: 3,
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
            pl: 2 
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
            flexDirection: { xs: "column", md: "row" },
            alignItems: "center",
            justifyContent: "space-between",
            px: 3,
            mb: 3,
            gap: 3,
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
            {((fromPlan && (userLocation || plan.length > 0)) || selectedVenue) && (
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
              display: { xs: "none", md: "block" },
              width: "6px",
              alignSelf: "stretch",
              background: `linear-gradient(to bottom, rgba(255, 78, 205, 0) 0%, #900B6A 20%, #900B6A 80%, rgba(255, 78, 205, 0) 100%)`,
              borderRadius: "3px",
              mx: 2,
            }}
          />

          {/* Right: Venue Card or Plan Summary */}
          <Box
            sx={{
              width: "100%",
              maxWidth: fromPlan ? 550 : 320,
              flex: fromPlan ? 1.2 : "initial",
              mt: { xs: 2, md: 0 },
            }}
          >
            {fromPlan ? (
              <CompactPlanSummary />
            ) : (
              selectedVenue && <VenueCard venue={selectedVenue} variant="compact" />
            )}
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
          />
        </Box>
      </Box>
    </PageWrapper>
  );
}
