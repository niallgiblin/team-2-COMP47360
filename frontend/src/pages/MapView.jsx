// main map view page
// can view a user's current plan, load a saved or shared plan, favourite venue
// displays colour-coded busyness zones

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
import DirectionSidebar from "../components/DirectionSidebar";
import CompactSavedPlans from '../components/CompactSavedPlans';
import CompactFavorites from '../components/CompactFavorites';
import SharedPlans from "../components/SharedPlans";
import CompactSharedPlans from "../components/CompactSharedPlans";

// Data and context
import { usePlan } from "../context/PlanContext";
import { useBusyness } from "../context/BusynessContext";
import { safeSetItem, safeGetItem, STORAGE_KEYS } from "../utils/storageUtils";

// External libraries, utilities for directions and geo-calculations
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";
import { DateTime } from "luxon";

// Cache for map data
const mapDataCache = {
  zoneData: null,
  venuesData: null,
  timestamp: null,
  duration: 10 * 60 * 1000 // 10 minutes
};

// function to generate forecast timestamps in NY time
const generateNext12Hours = () => {
  const timestamps = [];
  
  // Use current time instead of fixed date
  const now = DateTime.now().setZone("America/New_York");
  const baseDate = now.startOf('hour').plus({ hours: 1 }); // Start from next hour

  for (let i = 0; i < 11; i++) { // Next 11 hours (removed the problematic last hour)
    const dt = baseDate.plus({ hours: i });
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

// NYC bounding box check
function isInNYC(lat, lng) {
  return (
    lat >= 40.4774 && lat <= 40.9176 &&
    lng >= -74.2591 && lng <= -73.7004
  );
}


// main component - renders map, venue cards, forecast slider
export default function MapView() {
  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  // Define tab styles
  const tabStyles = {
    textTransform: "uppercase",
    fontWeight: "bold",
    color: "#BBB",
    minWidth: 120,
  };

  // State for map data
  const [zoneData, setZoneData] = useState(null);
  const [venues, setVenues] = useState([]);
  const [enrichedVenues, setEnrichedVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);

  // State for user location and directions
  const [userLocation, setUserLocation] = useState(null);
  const [manualStart, setManualStart] = useState("");
  const [manualDestination, setManualDestination] = useState(""); // Add missing manualDestination state
  const [showDirections, setShowDirections] = useState(false);
  const [directions, setDirections] = useState(null);
  const [travelMode, setTravelMode] = useState("WALKING"); // Add missing travelMode state
  // const [directionsLoading, setDirectionsLoading] = useState(false);

  // State for selected venue and plan
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [fromPlan, setFromPlan] = useState(false);
  const [plan, setPlan] = useState([]);

  // State for forecast
  const [selectedTimestamp, setSelectedTimestamp] = useState(null);
  const [forecastTimestamps] = useState(generateNext12Hours());
  const [mode, setMode] = useState("live"); // Add missing mode state for busyness level toggle
  const [viewMode, setViewMode] = useState("plan"); // Add missing viewMode state
  const [resetMapKey, setResetMapKey] = useState(0); // Add missing resetMapKey state
  const [zoneCenter, setZoneCenter] = useState(null); // Add missing zoneCenter state
  const [directionsPolyline, setDirectionsPolyline] = useState(null); // Add missing directionsPolyline state

  // Refs
  const mapSectionRef = useRef(null);

  // Context data
  const { busynessData: contextBusynessData, predictionData: contextPredictionData, fetchAllData } = useBusyness();
  // const { plan: currentPlan } = usePlan();

  // Get state from navigation
  const location = useLocation();
  const selectedVenueFromState = location.state?.selectedVenue;

  // Check if we have cached map data
  const getCachedMapData = () => {
    if (mapDataCache.zoneData && 
        mapDataCache.venuesData && 
        mapDataCache.timestamp && 
        Date.now() - mapDataCache.timestamp < mapDataCache.duration) {
      console.log('🔍 [CACHE] Using cached map data');
      return {
        zoneData: mapDataCache.zoneData,
        venuesData: mapDataCache.venuesData
      };
    }
    return null;
  };

  // Handler for setting location on button click
  const handleSetLocation = async () => {
    if (manualStart.trim()) {
      const loc = await geocodeAddress(manualStart);
      if (loc && isInNYC(loc.lat, loc.lng)) {
        setUserLocation(loc);
      } else if (loc) {
        alert("The selected location is not in New York City. Please enter a valid NYC address.");
      }
    }
  };

  // 1. Fetch busyness data from context on mount only if not already available
  useEffect(() => {
    const loadBusynessData = async () => {
      // Only fetch if we don't have recent data
      if (!contextBusynessData || contextBusynessData.length === 0) {
        try {
          await fetchAllData();
        } catch (err) {
          console.error("Failed to load busyness data:", err);
        }
      } else {
        console.log('🔍 [CACHE] Using existing busyness data from context');
      }
    };
    loadBusynessData();
  }, []); // Empty dependency array - only run once on mount

  // 2. Load zone polygons for map coloring
  useEffect(() => {
    const fetchZoneData = async () => {
      // Check cache first
      const cachedData = getCachedMapData();
      if (cachedData) {
        setZoneData(cachedData.zoneData);
        setVenues(cachedData.venuesData);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch("/manhattanZones.geojson");
        if (!response.ok) throw new Error("Failed to fetch zone data");
        const json = await response.json();
        setZoneData(json);
        
        // Cache the zone data
        try {
          mapDataCache.zoneData = json;
          mapDataCache.timestamp = Date.now();
          console.log('🔍 [CACHE] Cached zone data');
        } catch (e) {
          console.warn('Failed to cache zone data:', e.message);
        }
      } catch (err) {
        console.error("Error loading GeoJSON:", err);
        setIsMock(true); // Fallback if zones fail
      }
    };
    fetchZoneData();
  }, []);

  // 3. Fetch venues data and use busyness data from context
  useEffect(() => {
    const fetchVenuesData = async () => {
      // Skip if we already have cached data
      const cachedData = getCachedMapData();
      if (cachedData) {
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/vibe/map-data`);
        if (!res.ok) throw new Error("Server error on map-data fetch");
        const data = await res.json();
        const venuesData = data.locations || [];
        setVenues(venuesData);
        
        // Cache the venues data with essential fields only
        try {
          const essentialVenues = venuesData.map(venue => ({
            id: venue.id,
            name: venue.name,
            address: venue.address,
            lat: venue.lat || venue.latitude,
            lng: venue.lng || venue.longitude,
            zone: venue.zone,
            zoneId: venue.zoneId,
            type: venue.type,
            price: venue.price,
            rating: venue.rating
          }));
          mapDataCache.venuesData = essentialVenues;
          mapDataCache.timestamp = Date.now();
          console.log('🔍 [CACHE] Cached essential venues data');
        } catch (e) {
          console.warn('Failed to cache venues data:', e.message);
        }
      } catch (err) {
        // Fallback to mock data
        console.warn("Falling back to mock data due to fetch error:", err);
        setVenues([]); // Set venues to empty array on API failure
        if (!selectedVenueFromState) setSelectedVenue(null); // Clear selected venue if no plan
        setIsMock(true);
      } finally {
        setLoading(false);
      }
    };
    fetchVenuesData();
  }, []); // Only run on mount

  // Handle context data updates separately
  useEffect(() => {
    if (contextBusynessData && contextBusynessData.length > 0) {
      setIsMock(false);
    } else {
      setIsMock(true);
    }
    
    if (contextPredictionData && contextPredictionData.length > 0) {
      const first = contextPredictionData[0]?.predictions?.[0]?.timestamp;
      if (first) setSelectedTimestamp(first);
      setIsMock(false);
    } else {
      setIsMock(true);
    }
  }, [contextBusynessData, contextPredictionData]);

  // Always use dummy busyness and prediction data if isMock is true
  useEffect(() => {
    if (!zoneData || !isMock) return;
    
    // No longer using dummy data - just return
  }, [zoneData, isMock]);

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


  // REMOVED: The fallback useEffect that was generating dummy predictions
  // We only want real data from the API


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
    } else {
      alert("Please set a start location.");
      return;
    }

    // Determine Destination
    if (selectedVenue) {
      destination = { lat: selectedVenue.lat, lng: selectedVenue.lng };
    } else if (planVenues.length > 0) {
      destination = { lat: planVenues[0].lat, lng: planVenues[0].lng };
    } else {
      alert("Please select a destination venue.");
      return;
    }

    // setDirectionsLoading(true); // This line was commented out
    setShowDirections(true);

    try {
      let directionsData = null;

      if (hasPlan && planVenues.length > 1) {
        // Multi-stop route for plans
        directionsData = await getMultiStopDirections(start, planVenues, GOOGLE_API_KEY);
      } else {
        // Single destination route
        directionsData = await getSingleDestinationDirections(start, destination, GOOGLE_API_KEY);
      }

      if (directionsData) {
        setDirections(directionsData);
      } else {
        alert("Could not load directions. Please try again.");
      }
    } catch (error) {
      console.error("Directions error:", error);
      alert("Error loading directions. Please try again.");
    } finally {
      // setDirectionsLoading(false); // This line was commented out
    }
  };

  // Helper function to validate coordinates
  const isValidCoord = (obj) => obj && typeof obj.lat === 'number' && typeof obj.lng === 'number' && !isNaN(obj.lat) && !isNaN(obj.lng);

  // Reset map function
  const handleResetMap = () => {
    setShowDirections(false);
    setDirections(null);
    setSelectedVenue(null);
    setUserLocation(null);
    setManualStart("");
    // Reset other map-related state as needed
  };

  // Toggle directions function
  const toggleDirections = () => {
    setShowDirections(!showDirections);
  };

  // Helper functions for directions
  const getSingleDestinationDirections = async (start, destination, apiKey) => {
    // Placeholder implementation
    console.log("Getting single destination directions");
    return null;
  };

  const getMultiStopDirections = async (start, venues, apiKey) => {
    // Placeholder implementation
    console.log("Getting multi-stop directions");
    return null;
  };

  // 5. Fetch directions when mode changes (walk/ public transport)
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
              <Button
                variant="contained"
                onClick={handleSetLocation}
                sx={{
                  background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                  color: '#000',
                  fontWeight: 'bold',
                  px: 2,
                  py: 1,
                  borderRadius: 2,
                  height: 40,
                  alignSelf: 'center',
                  mt: 0.5,
                }}
              >
                Set Location
              </Button>
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
          {mode === "forecast" && contextPredictionData && contextPredictionData.length > 0 && (
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
              <CompactPlanSummary />
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
          <DemoMap
            venues={enrichedVenues}
            selectedVenue={selectedVenue}
            onSelectVenue={setSelectedVenue}
            fromPlan={fromPlan}
            busynessData={contextBusynessData || []}
            zoneData={zoneData}
            userLocation={userLocation}
            mode={mode}
            predictionData={contextPredictionData || []}
            selectedTimestamp={selectedTimestamp}
            plan={plan}
            routeCoords={directionsPolyline}
            showDirections={showDirections}
            resetMapKey={resetMapKey}
            zoneCenter={zoneCenter}
            setZoneCenter={setZoneCenter}
          />
          <DirectionSidebar
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
