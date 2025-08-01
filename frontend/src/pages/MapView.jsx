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
import { STORAGE_KEYS } from "../utils/storageUtils";

// External libraries, utilities for directions and geo-calculations
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";
import { DateTime } from "luxon";
import polyline from "@mapbox/polyline";

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



// Working polyline decoder for Google Directions API
const decodePolylineSimple = (encoded) => {
  if (!encoded) {
    return [];
  }
  
  
  const poly = [];
  let index = 0, len = encoded.length;
  let lat = 0, lng = 0;

  while (index < len) {
    let shift = 0, result = 0;

    do {
      let b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (result >= 0x20);

    let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      let b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (result >= 0x20);

    let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    // Return in [lat, lng] format for Leaflet
    const coord = [lat / 1e5, lng / 1e5];
    poly.push(coord);
    
    // Debug first few coordinates
    if (poly.length <= 3) {
      // Debug logging removed
    }
  }


  return poly;
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

  // State for selected venue and plan
  const [selectedVenue, setSelectedVenue] = useState(null);

  // State for forecast
  const [selectedTimestamp, setSelectedTimestamp] = useState(null);
  const [forecastTimestamps] = useState(generateNext12Hours());
  const [mode, setMode] = useState("live");
  const [viewMode, setViewMode] = useState("plan");
  const [resetMapKey] = useState(0);
  const [zoneCenter, setZoneCenter] = useState(null);

  // Debug mode changes
  useEffect(() => {

  }, [mode]);

  // Refs
  const mapSectionRef = useRef(null);

  // Context data
  const { busynessData: contextBusynessData, predictionData: contextPredictionData, fetchAllData } = useBusyness();
  const { plan: currentPlan, fromPlan: contextFromPlan, setFromPlan: setContextFromPlan } = usePlan();

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

    // If viewing a plan, only show plan venues
    if (fromPlan && plan.length > 0) {
      const enriched = plan.map((venue) => {
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
      return;
    }

    // Otherwise, enrich all venues
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

    // If viewing a plan with multiple venues, create route between plan venues
    if (hasPlan && planVenues.length > 1) {
      // Check if we have a user location or manual start - if so, use that as start
      if (userLocation || manualStart.trim()) {
        // Use user location or manual start as origin, route through all plan venues
        if (userLocation) {
          start = userLocation;
        } else {
          start = await geocodeAddress(manualStart);
          if (!start) {
            alert("Could not find the start location.");
            return;
          }
        }
        destination = { lat: planVenues[planVenues.length - 1].lat, lng: planVenues[planVenues.length - 1].lng };
      } else {
        // No user start - use first venue as start, last venue as destination
        start = { lat: planVenues[0].lat, lng: planVenues[0].lng };
        destination = { lat: planVenues[planVenues.length - 1].lat, lng: planVenues[planVenues.length - 1].lng };
      }
    } else if (hasPlan && planVenues.length === 1) {
      // Single venue in plan - use it as destination
      destination = { lat: planVenues[0].lat, lng: planVenues[0].lng };
      
      // Determine Start Location - use first venue as default if no user location
      if (userLocation) {
        start = userLocation;
      } else if (manualStart.trim()) {
        start = await geocodeAddress(manualStart);
        if (!start) {
          alert("Could not find the start location.");
          return;
        }
      } else {
        // No start location provided - use first venue as start and destination
        start = { lat: planVenues[0].lat, lng: planVenues[0].lng };
        destination = { lat: planVenues[0].lat, lng: planVenues[0].lng };
      }
    } else {
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
                  
                  // Process legs to preserve structure and add leg information
                  
                  let processedLegs;
                  
                  if (travelMode === 'TRANSIT' && fromPlan && plan.length > 1) {
                    // For transit with multiple venues, create separate legs for each venue segment
                    processedLegs = [];
                    
                    for (let i = 0; i < plan.length - 1; i++) {
                      const fromVenue = plan[i];
                      const toVenue = plan[i + 1];
                      
                      // Get transit directions for this segment
                      try {
                        const segmentDirections = await getSingleDestinationDirections(
                          { lat: fromVenue.lat, lng: fromVenue.lng },
                          { lat: toVenue.lat, lng: toVenue.lng },
                          GOOGLE_API_KEY
                        );
                        
                        if (segmentDirections && segmentDirections.legs) {
                          const segmentLeg = segmentDirections.legs[0];
                          const segmentSteps = segmentLeg.steps || [];
                          
                          // Add steps for this segment with proper leg information
                          const segmentProcessedSteps = segmentSteps.map((step) => ({
                            ...step,
                            legIndex: i,
                            legStartLocation: { ...segmentLeg.startLocation, name: fromVenue.name },
                            legEndLocation: { ...segmentLeg.endLocation, name: toVenue.name }
                          }));
                          
                          processedLegs.push(...segmentProcessedSteps);
                        }
                      } catch {
                        // Error handling for segment directions
                      }
                    }
                  } else {
                    // For walking or single destination, use the original leg processing
                    if (travelMode === 'WALK' && fromPlan && plan.length > 1) {
                      // For walking with multiple venues, create separate legs for each venue segment
                      processedLegs = [];
                      
                      for (let i = 0; i < plan.length - 1; i++) {
                        const fromVenue = plan[i];
                        const toVenue = plan[i + 1];
                        
                        // Get walking directions for this segment
                        try {
                          const segmentDirections = await getSingleDestinationDirections(
                            { lat: fromVenue.lat, lng: fromVenue.lng },
                            { lat: toVenue.lat, lng: toVenue.lng },
                            GOOGLE_API_KEY
                          );
                          
                          if (segmentDirections && segmentDirections.legs) {
                            const segmentLeg = segmentDirections.legs[0];
                            const segmentSteps = segmentLeg.steps || [];
                            
                            // Add steps for this segment with proper leg information
                            const segmentProcessedSteps = segmentSteps.map((step) => ({
                              ...step,
                              legIndex: i,
                              legStartLocation: { ...segmentLeg.startLocation, name: fromVenue.name },
                              legEndLocation: { ...segmentLeg.endLocation, name: toVenue.name }
                            }));
                            
                            processedLegs.push(...segmentProcessedSteps);
                          }
                        } catch {
                          // Error handling for segment directions
                        }
                      }
                    } else {
                      // For single destination or other cases, use the original leg processing
                      processedLegs = directionsData.legs.map((leg, legIndex) => {
                        const legSteps = leg.steps || [];
                        
                        // Get venue names for this leg
                        let startVenueName = 'Start';
                        let endVenueName = 'Destination';
                        
                        if (fromPlan && plan.length > 0) {
                          if (travelMode === 'TRANSIT') {
                            // For transit, we only have one leg from first to last venue
                            startVenueName = plan[0].name;
                            endVenueName = plan[plan.length - 1].name;
                          } else {
                            // For walking, we have multiple legs
                            if (legIndex === 0) {
                              startVenueName = plan[0].name;
                              endVenueName = plan[1]?.name || 'Destination';
                            } else if (legIndex < plan.length - 1) {
                              startVenueName = plan[legIndex].name;
                              endVenueName = plan[legIndex + 1].name;
                            } else {
                              startVenueName = plan[plan.length - 2]?.name || 'Previous Venue';
                              endVenueName = plan[plan.length - 1].name;
                            }
                          }
                        }
                        
                        return legSteps.map((step) => ({
                          ...step,
                          legIndex,
                          legStartLocation: { ...leg.startLocation, name: startVenueName },
                          legEndLocation: { ...leg.endLocation, name: endVenueName }
                        }));
                      }).flat();
                    }
                  }
                  
                  setDirections(processedLegs);
        if (directionsData.polyline) {
          try {
            
            let decodedPolyline;
            // The Google Directions API v2 returns encoded polyline that needs to be decoded
            // For plan routes, create a seamless route by getting directions between each venue
            if (fromPlan && plan.length > 0) {
              
              // Get directions between each venue in the plan
              const routeSegments = [];
              
              for (let i = 0; i < plan.length - 1; i++) {
                const fromVenue = plan[i];
                const toVenue = plan[i + 1];
                
                
                try {
                  const segmentDirections = await getSingleDestinationDirections(
                    { lat: fromVenue.lat, lng: fromVenue.lng },
                    { lat: toVenue.lat, lng: toVenue.lng },
                    GOOGLE_API_KEY
                  );
                  
                  if (segmentDirections && segmentDirections.polyline) {
                    // Decode this segment's polyline
                    let segmentCoords;
                    try {
                      segmentCoords = polyline.decode(segmentDirections.polyline);
                    } catch {
                      segmentCoords = decodePolylineSimple(segmentDirections.polyline);
                    }
                    if (segmentCoords.length > 0) {
                      routeSegments.push(...segmentCoords);
                    }
                  }
                } catch {
                  // Add direct line between venues as fallback
                  routeSegments.push([fromVenue.lat, fromVenue.lng]);
                  routeSegments.push([toVenue.lat, toVenue.lng]);
                }
              }
              
              if (routeSegments.length > 0) {
                decodedPolyline = routeSegments;
              } else {
                // Fallback to direct lines between venues
                decodedPolyline = plan.map(venue => [venue.lat, venue.lng]);
              }
            } else {
                          // For single destination routes, use the original polyline
            if (typeof directionsData.polyline === 'string') {
              
              // Use mapbox polyline decoder
              try {
                decodedPolyline = polyline.decode(directionsData.polyline);
              } catch {
                decodedPolyline = decodePolylineSimple(directionsData.polyline);
              }
              
              // Log the decoded coordinates for debugging
              if (decodedPolyline.length > 0) {
                // Debug logging removed
              }
            } else if (directionsData.polyline && directionsData.polyline.points) {
                // Polyline with points array (shouldn't happen with v2 API)
                decodedPolyline = directionsData.polyline.points.map(point => [point.lat, point.lng]);
              } else {
                decodedPolyline = [];
              }
            }
            
            if (decodedPolyline.length > 0) {
              setDirectionsPolyline(decodedPolyline);
            } else {
              // Create a simple straight-line route as fallback
              const start = directionsData.legs?.[0]?.startLocation;
              const end = directionsData.legs?.[directionsData.legs.length - 1]?.endLocation;
              if (start && end) {
                const fallbackRoute = [
                  [start.latLng.latitude, start.latLng.longitude],
                  [end.latLng.latitude, end.latLng.longitude]
                ];
                setDirectionsPolyline(fallbackRoute);
              } else {
                // If we can't get start/end from legs, try to create route from plan venues
                if (fromPlan && plan.length > 0) {
                  const fallbackRoute = plan.map(venue => [venue.lat, venue.lng]);
                  setDirectionsPolyline(fallbackRoute);
                } else {
                  setDirectionsPolyline(null);
                }
              }
            }
          } catch (error) {
            console.error('Error decoding polyline:', error);
            // Create a simple straight-line route as fallback
            const start = directionsData.legs?.[0]?.startLocation;
            const end = directionsData.legs?.[directionsData.legs.length - 1]?.endLocation;
            if (start && end) {
              const fallbackRoute = [
                [start.latLng.latitude, start.latLng.longitude],
                [end.latLng.latitude, end.latLng.longitude]
              ];
              setDirectionsPolyline(fallbackRoute);
            } else {
              setDirectionsPolyline(null);
            }
          }
        } else {
          // Create a simple straight-line route as fallback
          const start = directionsData.legs?.[0]?.startLocation;
          const end = directionsData.legs?.[directionsData.legs.length - 1]?.endLocation;
          if (start && end) {
            const fallbackRoute = [
              [start.latLng.latitude, start.latLng.longitude],
              [end.latLng.latitude, end.latLng.longitude]
            ];
            setDirectionsPolyline(fallbackRoute);
          } else {
            setDirectionsPolyline(null);
          }
        }
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
    if (showDirections) {
      setShowDirections(false);
    } else {
      handleGetDirections();
    }
  };

  // Helper functions for directions
  const getSingleDestinationDirections = async (start, destination, apiKey) => {
    try {
      
      const requestBody = {
        origin: { 
          location: { 
            latLng: { 
              latitude: start.lat, 
              longitude: start.lng 
            } 
          } 
        },
        destination: { 
          location: { 
            latLng: { 
              latitude: destination.lat, 
              longitude: destination.lng 
            } 
          } 
        },
        travelMode: travelMode === 'WALK' ? 'WALK' : 'TRANSIT'
      };

      // Only add routingPreference for DRIVE mode (if we had it)
      if (travelMode === 'DRIVE') {
        requestBody.routingPreference = 'TRAFFIC_AWARE';
      }
      
      const response = await fetch(`https://routes.googleapis.com/directions/v2:computeRoutes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.legs,routes.polyline.encodedPolyline,routes.legs.steps,routes.legs.steps.navigationInstruction,routes.legs.steps.transitDetails'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Single destination Directions API error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      const route = data.routes?.[0];
      
      if (!route) {
        throw new Error('No route found in response');
      }

      // Process the legs to extract proper step instructions
      const processedLegs = route.legs.map(leg => ({
        ...leg,
        steps: leg.steps.map((step) => {
          // Try to get instruction from various possible sources
          let instruction = "Continue on route";
          
          // Priority order for instruction extraction
          if (step.navigationInstruction?.instructions) {
            instruction = step.navigationInstruction.instructions;
          } else if (step.instructions) {
            instruction = step.instructions;
          } else if (step.navigationInstruction?.primaryText?.text) {
            instruction = step.navigationInstruction.primaryText.text;
          } else if (step.navigationInstruction?.primaryText && typeof step.navigationInstruction.primaryText === 'string') {
            instruction = step.navigationInstruction.primaryText;
          }
          
          // Clean up instruction text
          if (typeof instruction === 'number' || (typeof instruction === 'string' && instruction.match(/^\d+s?$/))) {
            instruction = "Continue on route";
          }
          
          // For transit steps, create a meaningful instruction
          if (step.transitDetails) {
            const line = step.transitDetails.line?.shortName || 'Transit';
            const headsign = step.transitDetails.headsign || 'destination';
            instruction = `Take ${line} toward ${headsign}`;
          } else if (instruction === "Continue on route" && step.staticDuration && step.staticDuration > 0) {
            // Only create duration-based instruction if we have a valid duration
            const minutes = Math.round(step.staticDuration / 60);
            if (!isNaN(minutes) && minutes > 0) {
              instruction = `Continue for ${minutes} minutes`;
            }
          }
          
          // Calculate duration and distance safely
          let duration = null;
          let distance = null;
          if (step.staticDuration && step.staticDuration > 0) {
            const minutes = Math.round(step.staticDuration / 60);
            if (!isNaN(minutes) && minutes > 0) {
              duration = `${minutes} min`;
              distance = `${minutes} min`;
            }
          }
          
          return {
            ...step,
            instructions: instruction,
            distance: distance,
            duration: duration,
            summary: instruction
          };
        })
      }));

      
      return {
        polyline: route.polyline?.encodedPolyline || route.polyline?.polyline || null,
        legs: processedLegs
      };
    } catch (error) {
      console.error('Error getting single destination directions:', error);
      return null;
    }
  };

  const getMultiStopDirections = async (start, venues, apiKey) => {
    try {
      
      // Check if start is a user location (has lat/lng) or a venue from the plan
      const isUserStart = start && typeof start.lat === 'number' && typeof start.lng === 'number';
      
      // Check if this is a single venue plan with same start and destination
      const isSingleVenuePlan = venues.length === 1 && 
        start.lat === venues[0].lat && start.lng === venues[0].lng;
      
      if (isSingleVenuePlan) {
        return {
          polyline: null,
          legs: [{ steps: [{ instructions: "You are already at your destination" }] }]
        };
      }
      
      let waypoints;
      let origin;
      let destination;
      
      if (travelMode === 'TRANSIT') {
        // For TRANSIT mode, we need to handle each segment separately since Google doesn't support waypoints
        // We'll get directions for each venue-to-venue segment
        if (isUserStart) {
          // User start to last venue (single route)
          origin = { location: { latLng: { latitude: start.lat, longitude: start.lng } } };
          destination = { location: { latLng: { latitude: venues[venues.length - 1].lat, longitude: venues[venues.length - 1].lng } } };
        } else {
          // First venue to last venue (single route)
          origin = { location: { latLng: { latitude: venues[0].lat, longitude: venues[0].lng } } };
          destination = { location: { latLng: { latitude: venues[venues.length - 1].lat, longitude: venues[venues.length - 1].lng } } };
        }
        waypoints = []; // No waypoints for TRANSIT
      } else {
        // For WALK mode, we can use waypoints
        if (isUserStart) {
          // User provided start location - route from user to all plan venues
          waypoints = venues.map(venue => ({
            location: { latLng: { latitude: venue.lat, longitude: venue.lng } }
          }));
          origin = { location: { latLng: { latitude: start.lat, longitude: start.lng } } };
          destination = { location: { latLng: { latitude: venues[venues.length - 1].lat, longitude: venues[venues.length - 1].lng } } };
        } else {
          // No user start - route between plan venues only
          waypoints = venues.slice(1, -1).map(venue => ({
            location: { latLng: { latitude: venue.lat, longitude: venue.lng } }
          }));
          origin = { location: { latLng: { latitude: venues[0].lat, longitude: venues[0].lng } } };
          destination = { location: { latLng: { latitude: venues[venues.length - 1].lat, longitude: venues[venues.length - 1].lng } } };
        }
      }


      const requestBody = {
        origin: origin,
        destination: destination,
        travelMode: travelMode === 'WALK' ? 'WALK' : 'TRANSIT'
      };

      // Add waypoints for WALK mode
      if (travelMode === 'WALK' && waypoints.length > 0) {
        requestBody.intermediates = waypoints;
      }

      const response = await fetch(`https://routes.googleapis.com/directions/v2:computeRoutes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.legs,routes.polyline.encodedPolyline,routes.legs.steps,routes.legs.steps.navigationInstruction,routes.legs.steps.transitDetails'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Multi-stop Directions API error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      const route = data.routes?.[0];
      
      if (!route) {
        throw new Error('No route found in response');
      }

      // Process the legs to extract proper step instructions
      const processedLegs = route.legs.map(leg => ({
        ...leg,
        steps: leg.steps.map((step) => {
          // Try to get instruction from various possible sources
          let instruction = "Continue on route";
          
          // Priority order for instruction extraction
          if (step.navigationInstruction?.instructions) {
            instruction = step.navigationInstruction.instructions;
          } else if (step.instructions) {
            instruction = step.instructions;
          } else if (step.navigationInstruction?.primaryText?.text) {
            instruction = step.navigationInstruction.primaryText.text;
          } else if (step.navigationInstruction?.primaryText && typeof step.navigationInstruction.primaryText === 'string') {
            instruction = step.navigationInstruction.primaryText;
          }
          
          // Clean up instruction text
          if (typeof instruction === 'number' || (typeof instruction === 'string' && instruction.match(/^\d+s?$/))) {
            instruction = "Continue on route";
          }
          
          // For transit steps, create a meaningful instruction
          if (step.transitDetails) {
            const line = step.transitDetails.line?.shortName || 'Transit';
            const headsign = step.transitDetails.headsign || 'destination';
            instruction = `Take ${line} toward ${headsign}`;
          } else if (instruction === "Continue on route" && step.staticDuration && step.staticDuration > 0) {
            // Only create duration-based instruction if we have a valid duration
            const minutes = Math.round(step.staticDuration / 60);
            if (!isNaN(minutes) && minutes > 0) {
              instruction = `Continue for ${minutes} minutes`;
            }
          }
          
          // Calculate duration and distance safely
          let duration = null;
          let distance = null;
          if (step.staticDuration && step.staticDuration > 0) {
            const minutes = Math.round(step.staticDuration / 60);
            if (!isNaN(minutes) && minutes > 0) {
              duration = `${minutes} min`;
              distance = `${minutes} min`;
            }
          }
          
          return {
            ...step,
            instructions: instruction,
            distance: distance,
            duration: duration,
            summary: instruction
          };
        })
      }));

      
      return {
        polyline: route.polyline?.encodedPolyline || route.polyline?.polyline || null,
        legs: processedLegs
      };
    } catch (error) {
      console.error('Error getting multi-stop directions:', error);
      return null;
    }
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
