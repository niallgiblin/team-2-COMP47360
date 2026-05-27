// main map view page
// can view a user's current plan, load a saved or shared plan, favourite venue
// displays colour-coded busyness zones

// react and routing components
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
import { STORAGE_KEYS } from "../utils/storageUtils";
import { authFetch, vibeAPI } from "../../services/apiService";

import { getFallbackForecastTimestamps } from "../utils/forecastTimes";
import { enrichVenuesWithZones } from "../utils/zoneEnrichment";
import {
  computeRoute,
  computeMultiStopRoute,
  ROUTE_NOT_CONFIGURED,
} from "../utils/routeClient";
import {
  normalizeRoute,
  buildFallbackPolyline,
  FALLBACK_POLYLINE_NOTICE,
} from "../utils/routeNormalizer";
import { createRouteSegmentCache } from "../utils/routeSegmentCache";
import {
  ROUTE_LOAD_ERROR,
} from "../components/DirectionSidebar";

// Cache for map data
const mapDataCache = {
  zoneData: null,
  venuesData: null,
  timestamp: null,
  duration: 10 * 60 * 1000 // 10 minutes
};

const routeSegmentCache = createRouteSegmentCache();

async function fetchCachedSegment(origin, destination, mode, apiKey) {
  const cached = routeSegmentCache.get(origin, destination, mode);
  if (cached !== undefined) {
    return cached;
  }
  const response = await computeRoute({
    origin,
    destination,
    travelMode: mode,
    apiKey,
  });
  if (!response?.error) {
    routeSegmentCache.set(origin, destination, mode, response);
  }
  return response;
}

function buildMultiStopWalkingRequest(start, venues, isUserStart) {
  if (isUserStart) {
    return {
      origin: start,
      destination: {
        lat: venues[venues.length - 1].lat,
        lng: venues[venues.length - 1].lng,
      },
      intermediates: venues.map((venue) => ({ lat: venue.lat, lng: venue.lng })),
    };
  }
  return {
    origin: { lat: venues[0].lat, lng: venues[0].lng },
    destination: {
      lat: venues[venues.length - 1].lat,
      lng: venues[venues.length - 1].lng,
    },
    intermediates: venues.slice(1, -1).map((venue) => ({
      lat: venue.lat,
      lng: venue.lng,
    })),
  };
}

function attachPlanVenueNames(steps, plan, travelMode) {
  return steps.map((step) => {
    const legIndex = step.legIndex ?? 0;
    let startName = step.legStartLocation?.name ?? "Start";
    let endName = step.legEndLocation?.name ?? "Destination";

    if (plan.length > 0) {
      if (travelMode === "TRANSIT" && plan.length > 1) {
        startName = plan[0].name;
        endName = plan[plan.length - 1].name;
      } else if (plan.length > 1) {
        startName = plan[legIndex]?.name ?? startName;
        endName = plan[legIndex + 1]?.name ?? endName;
      } else {
        startName = plan[0].name;
        endName = plan[0].name;
      }
    }

    return {
      ...step,
      legStartLocation: { ...(step.legStartLocation ?? {}), name: startName },
      legEndLocation: { ...(step.legEndLocation ?? {}), name: endName },
    };
  });
}

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
  const [manualDestination, setManualDestination] = useState("");
  const [showDirections, setShowDirections] = useState(false);
  const [directions, setDirections] = useState(null);
  const [travelMode, setTravelMode] = useState("WALK");
  const [directionsPolyline, setDirectionsPolyline] = useState(null);
  const [routeError, setRouteError] = useState(null);
  const [routeFallbackNotice, setRouteFallbackNotice] = useState(null);
  const directionsFetchIdRef = useRef(0);

  // State for selected venue and plan
  const [selectedVenue, setSelectedVenue] = useState(null);

  // State for forecast — timestamps come from API data when available
  const [selectedTimestamp, setSelectedTimestamp] = useState(null);
  const [mode, setMode] = useState("live");
  const [viewMode, setViewMode] = useState("plan");
  const [resetMapKey] = useState(0);
  const [zoneCenter, setZoneCenter] = useState(null);

  // Debug mode changes
  useEffect(() => {

  }, [mode]);

  // Refs
  const mapSectionRef = useRef(null);
  const { busynessData: contextBusynessData, predictionData: contextPredictionData, fetchAllData } = useBusyness();
  const { plan: currentPlan, fromPlan: contextFromPlan, setFromPlan: setContextFromPlan } = usePlan();

  const mapBusynessData = useMemo(
    () => contextBusynessData || [],
    [contextBusynessData]
  );
  const mapPredictionData = useMemo(
    () => contextPredictionData || [],
    [contextPredictionData]
  );
  const handleSelectVenue = useCallback((venue) => {
    setSelectedVenue(venue);
  }, []);

  const forecastTimestamps = useMemo(() => {
    const firstZone = contextPredictionData?.[0]?.predictions;
    if (Array.isArray(firstZone) && firstZone.length > 0) {
      return firstZone.map((point) => point.timestamp).filter(Boolean);
    }
    return getFallbackForecastTimestamps();
  }, [contextPredictionData]);

  // Use context values for plan and fromPlan
  const plan = currentPlan || [];
  const fromPlan = contextFromPlan || false;

  // Get state from navigation
  const location = useLocation();
  const selectedVenueFromState = location.state?.selectedVenue;

  // Update context when venue is selected from navigation
  useEffect(() => {
    if (selectedVenueFromState) {
      setSelectedVenue(selectedVenueFromState);
      setContextFromPlan(false);
    }
  }, [selectedVenueFromState, setContextFromPlan]);

  // Initialize plan state from context or navigation
  useEffect(() => {
    if (selectedVenueFromState) {
      setContextFromPlan(true);
      // Plan is already set in context
    } else if (currentPlan && currentPlan.length > 0) {
      setContextFromPlan(true);
      // Plan is already set in context
    } else {
      setContextFromPlan(false);
      // Plan is already cleared in context
    }
  }, [selectedVenueFromState, currentPlan, setContextFromPlan]);

  // Check if we have cached map data
  const getCachedMapData = () => {
    if (mapDataCache.zoneData && 
        mapDataCache.venuesData && 
        mapDataCache.timestamp && 
        Date.now() - mapDataCache.timestamp < mapDataCache.duration) {

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
        const res = await authFetch(vibeAPI.mapDataUrl());
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
      const apiTimestamps = contextPredictionData[0]?.predictions?.map((p) => p.timestamp).filter(Boolean) || [];
      if (apiTimestamps.length > 0) {
        setSelectedTimestamp((current) =>
          current && apiTimestamps.includes(current) ? current : apiTimestamps[0]
        );
      }
      setIsMock(false);
    } else if (mode === "forecast") {
      setIsMock(true);
    }
  }, [contextBusynessData, contextPredictionData, mode]);

  // Always use dummy busyness and prediction data if isMock is true
  useEffect(() => {
    if (!zoneData || !isMock) return;
    
    // No longer using dummy data - just return
  }, [zoneData, isMock]);

  // 4. Enrich venues with zone IDs once all data is loaded
  useEffect(() => {
    if (!zoneData || venues.length === 0) {
      if (fromPlan && plan.length > 0) {
        setEnrichedVenues(enrichVenuesWithZones(plan, zoneData));
      }
      return;
    }

    if (fromPlan && plan.length > 0) {
      const enriched = enrichVenuesWithZones(plan, zoneData);
      setEnrichedVenues(enriched);
      if (!selectedVenueFromState && !selectedVenue && enriched.length > 0) {
        setSelectedVenue(enriched[0]);
      }
      return;
    }

    const enriched = enrichVenuesWithZones(venues, zoneData);
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

  const applyRouteResult = (response, routeStart, routeDestination, isStale) => {
    if (response?.error) {
      if (!isStale()) {
        setRouteError(
          response.error === ROUTE_NOT_CONFIGURED
            ? ROUTE_NOT_CONFIGURED
            : ROUTE_LOAD_ERROR
        );
      }
      return;
    }

    const normalized = normalizeRoute(response);
    let steps = normalized.steps;

    if (fromPlan && plan.length > 0) {
      steps = attachPlanVenueNames(steps, plan, travelMode);
    }

    if (isStale()) return;

    setDirections(steps);
    setRouteError(null);

    if (normalized.fallbackNotice) {
      setRouteFallbackNotice(normalized.fallbackNotice);
    } else {
      setRouteFallbackNotice(null);
    }

    if (normalized.polylineCoordinates.length > 0) {
      setDirectionsPolyline(normalized.polylineCoordinates);
    } else if (routeStart && routeDestination) {
      setDirectionsPolyline(buildFallbackPolyline(routeStart, routeDestination));
      setRouteFallbackNotice(FALLBACK_POLYLINE_NOTICE);
    } else if (fromPlan && plan.length > 0) {
      setDirectionsPolyline(plan.map((venue) => [venue.lat, venue.lng]));
      setRouteFallbackNotice(FALLBACK_POLYLINE_NOTICE);
    } else {
      setDirectionsPolyline(null);
    }
  };

  const handleGetDirections = async () => {
    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
    const fetchId = ++directionsFetchIdRef.current;
    const isStale = () => fetchId !== directionsFetchIdRef.current;

    setRouteError(null);
    setRouteFallbackNotice(null);
    setDirections(null);
    setDirectionsPolyline(null);
    setShowDirections(true);

    if (!apiKey) {
      setRouteError(ROUTE_NOT_CONFIGURED);
      return;
    }

    const hasPlan = fromPlan && plan.length > 0;
    const planVenues = hasPlan ? plan : [];
    const mode = travelMode === "WALK" ? "WALK" : "TRANSIT";

    let start = null;
    let destination = null;

    if (hasPlan && planVenues.length > 1) {
      if (userLocation || manualStart.trim()) {
        if (userLocation) {
          start = userLocation;
        } else {
          start = await geocodeAddress(manualStart);
          if (!start) {
            alert("Could not find the start location.");
            return;
          }
          if (!isStale()) setUserLocation(start);
        }
        destination = {
          lat: planVenues[planVenues.length - 1].lat,
          lng: planVenues[planVenues.length - 1].lng,
        };
      } else {
        start = { lat: planVenues[0].lat, lng: planVenues[0].lng };
        destination = {
          lat: planVenues[planVenues.length - 1].lat,
          lng: planVenues[planVenues.length - 1].lng,
        };
      }
    } else if (hasPlan && planVenues.length === 1) {
      destination = { lat: planVenues[0].lat, lng: planVenues[0].lng };

      if (userLocation) {
        start = userLocation;
      } else if (manualStart.trim()) {
        start = await geocodeAddress(manualStart);
        if (!start) {
          alert("Could not find the start location.");
          return;
        }
        if (!isStale()) setUserLocation(start);
      } else {
        start = { lat: planVenues[0].lat, lng: planVenues[0].lng };
        destination = { lat: planVenues[0].lat, lng: planVenues[0].lng };
      }
    } else {
      if (userLocation) {
        start = userLocation;
      } else if (manualStart.trim()) {
        start = await geocodeAddress(manualStart);
        if (!start) {
          alert("Could not find the start location.");
          return;
        }
        if (!isStale()) setUserLocation(start);
      } else {
        alert("Please set a start location.");
        return;
      }

      if (manualDestination.trim()) {
        destination = await geocodeAddress(manualDestination);
        if (!destination) {
          alert("Could not find the destination location.");
          return;
        }
      } else if (selectedVenue) {
        destination = { lat: selectedVenue.lat, lng: selectedVenue.lng };
      } else if (planVenues.length > 0) {
        destination = { lat: planVenues[0].lat, lng: planVenues[0].lng };
      } else {
        alert("Please select a destination venue or enter a destination address.");
        return;
      }
    }

    if (isStale()) return;

    try {
      if (
        hasPlan &&
        planVenues.length === 1 &&
        start.lat === destination.lat &&
        start.lng === destination.lng
      ) {
        setDirections([
          {
            instructions: "You are already at your destination",
            legIndex: 0,
            legStartLocation: { name: planVenues[0].name },
            legEndLocation: { name: planVenues[0].name },
          },
        ]);
        setDirectionsPolyline([[start.lat, start.lng]]);
        return;
      }

      if (hasPlan && planVenues.length > 1 && travelMode === "WALK") {
        const isUserStart = Boolean(userLocation || manualStart.trim());
        const { origin, destination: routeDestination, intermediates } =
          buildMultiStopWalkingRequest(start, planVenues, isUserStart);
        const response = await computeMultiStopRoute({
          origin,
          destination: routeDestination,
          intermediates,
          travelMode: mode,
          apiKey,
        });
        applyRouteResult(response, start, destination, isStale);
        return;
      }

      if (hasPlan && planVenues.length > 1 && travelMode === "TRANSIT") {
        const combinedSteps = [];
        let combinedPolyline = [];

        const segmentPairs = [];
        if (userLocation || manualStart.trim()) {
          segmentPairs.push({
            from: start,
            to: { lat: planVenues[0].lat, lng: planVenues[0].lng },
            fromName: "Start",
            toName: planVenues[0].name,
          });
          for (let i = 0; i < planVenues.length - 1; i += 1) {
            segmentPairs.push({
              from: { lat: planVenues[i].lat, lng: planVenues[i].lng },
              to: { lat: planVenues[i + 1].lat, lng: planVenues[i + 1].lng },
              fromName: planVenues[i].name,
              toName: planVenues[i + 1].name,
            });
          }
        } else {
          for (let i = 0; i < planVenues.length - 1; i += 1) {
            segmentPairs.push({
              from: { lat: planVenues[i].lat, lng: planVenues[i].lng },
              to: { lat: planVenues[i + 1].lat, lng: planVenues[i + 1].lng },
              fromName: planVenues[i].name,
              toName: planVenues[i + 1].name,
            });
          }
        }

        for (let i = 0; i < segmentPairs.length; i += 1) {
          const segment = segmentPairs[i];
          const response = await fetchCachedSegment(
            segment.from,
            segment.to,
            mode,
            apiKey
          );
          if (isStale()) return;
          if (response?.error) {
            applyRouteResult(response, start, destination, isStale);
            return;
          }
          const normalized = normalizeRoute(response);
          const segmentSteps = normalized.steps.map((step) => ({
            ...step,
            legIndex: i,
            legStartLocation: { ...(step.legStartLocation ?? {}), name: segment.fromName },
            legEndLocation: { ...(step.legEndLocation ?? {}), name: segment.toName },
          }));
          combinedSteps.push(...segmentSteps);
          if (normalized.polylineCoordinates.length > 0) {
            combinedPolyline = combinedPolyline.concat(normalized.polylineCoordinates);
          } else {
            combinedPolyline = combinedPolyline.concat(
              buildFallbackPolyline(segment.from, segment.to)
            );
          }
        }

        if (isStale()) return;
        setDirections(combinedSteps);
        setRouteError(null);
        setDirectionsPolyline(combinedPolyline);
        setRouteFallbackNotice(
          combinedPolyline.length > 0 ? null : FALLBACK_POLYLINE_NOTICE
        );
        return;
      }

      const response = await computeRoute({
        origin: start,
        destination,
        travelMode: mode,
        apiKey,
      });
      applyRouteResult(response, start, destination, isStale);
    } catch (error) {
      console.error("Directions error:", error);
      if (!isStale()) {
        setRouteError(ROUTE_LOAD_ERROR);
      }
    }
  };

  // Reset map function
  const handleResetMap = () => {
    directionsFetchIdRef.current += 1;
    setShowDirections(false);
    setDirections(null);
    setDirectionsPolyline(null);
    setRouteError(null);
    setRouteFallbackNotice(null);
    setSelectedVenue(null);
    setUserLocation(null);
    setManualStart("");
    setManualDestination("");
  };

  // Toggle directions function
  const toggleDirections = () => {
    if (showDirections) {
      directionsFetchIdRef.current += 1;
      setShowDirections(false);
      setDirections(null);
      setDirectionsPolyline(null);
      setRouteError(null);
      setRouteFallbackNotice(null);
    } else {
      handleGetDirections();
    }
  };

  // Refetch directions when travel mode changes while directions are visible
  useEffect(() => {
    if (!showDirections) return;

    const hasValidStart =
      userLocation || manualStart.trim() || (fromPlan && plan.length > 0);
    const hasValidDestination =
      selectedVenue || manualDestination.trim() || (fromPlan && plan.length > 0);

    const venuesReady = fromPlan ? plan.length > 0 : selectedVenue || manualDestination.trim();
    const zonesReady = zoneData !== null;
    const allReady =
      hasValidStart && hasValidDestination && venuesReady && zonesReady;

    if (allReady) {
      handleGetDirections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          onClick={() => {
    
            setMode("live");
          }}
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
          onClick={() => {
            setMode("forecast");
            if (!contextPredictionData || contextPredictionData.length === 0) {
              fetchAllData().catch((err) =>
                console.error("Failed to load forecast data:", err)
              );
            }
          }}
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
            mt: { xs: 2, lg: 3 },
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
                label={fromPlan && plan.length > 1 ? "Start location (optional)" : "Start location"}
                placeholder={fromPlan && plan.length > 1 ? "Enter address or leave empty to start from first venue" : "Enter address or location"}
                variant="outlined"
                value={manualStart}
                onChange={(e) => setManualStart(e.target.value)}
                data-testid="location-filter"
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
              selectedVenue || manualDestination.trim()) && (
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
            
            {/* Reset map button - positioned below start location */}
            <Box
              sx={{
                textAlign: "left",
                mt: 1,
                pl: 2,
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
            
          {/* Forecast Slider */}
          {mode === "forecast" && forecastTimestamps.length > 0 && (
            <Box
              sx={{
                width: "100%",
                maxWidth: "700px",
                mt: -1,
                mb: -5,
              }}
            >
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
          data-testid="map-container"
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
            onSelectVenue={handleSelectVenue}
            fromPlan={fromPlan}
            busynessData={mapBusynessData}
            zoneData={zoneData}
            userLocation={userLocation}
            mode={mode}
            predictionData={mapPredictionData}
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
            onClose={() => {
              directionsFetchIdRef.current += 1;
              setShowDirections(false);
              setDirections(null);
              setDirectionsPolyline(null);
              setRouteError(null);
              setRouteFallbackNotice(null);
            }}
            directions={directions}
            travelMode={travelMode}
            setTravelMode={setTravelMode}
            routeError={routeError}
            routeFallbackNotice={routeFallbackNotice}
          />
        </Box>
      </Box>
    </PageWrapper>
  );
}
