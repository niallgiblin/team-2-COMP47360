// Map component, using leaflet, supports busyness overlay, forecast/ live mode switching, routing directions, tooltips for each zone and venue
// Used on MapView.jsx page

// Leaflet map components
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  useMap,
  Tooltip,
  Polyline,
} from "react-leaflet";

import { Box } from "@mui/material";
import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import RouteDisplay from "./RouteDisplay";            // custom component for routing
import L from "leaflet";
import { getVenueIcon } from "../utils/mapIcons";

import { usePlan } from "../context/PlanContext";
import { DateTime } from "luxon";                     // library for handling time zones, datetime formatting

// Memoized Polyline component to prevent unnecessary re-renders
const MemoizedPolyline = React.memo(({ positions, color, weight, opacity }) => {
  return (
    <Polyline 
      positions={positions} 
      color={color} 
      weight={weight}
      opacity={opacity}
    />
  );
});

// Memoized RouteDisplay component to prevent unnecessary re-renders
const MemoizedRouteDisplay = React.memo(({ start, end }) => {
  return <RouteDisplay start={start} end={end} />;
});

// import custom icons for map markers
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// remove internal leaflet method for returning default icons, force leaflet to use custom markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// component definition
export default function DemoMap({
  venues = [],
  onSelectVenue,
  busynessData = [],
  zoneData,
  userLocation,
  mode = "forecast",
  predictionData = [],
  selectedTimestamp,
  plan = [],
  routeCoords = [],
  showDirections = false,
  resetMapKey = 0,
  zoneCenter,
  setZoneCenter,
  fromPlan: fromPlanProp,
}) {
  const [activeZoneVenues, setActiveZoneVenues] = useState([]);
  const allVenuesRef = useRef([]);
  const { selectedVenue } = usePlan();
  const [overridePlanMode, setOverridePlanMode] = useState(false);  // disables plan display if zone is manually clicked
  const mapRef = useRef(null);

  // Use mode directly instead of internal state
  // Don't override mode when there's a plan - let forecast mode work with plans
  const currentMode = mode;
  


  // Mapping from DNN model names to GeoJSON LocationIDs
  // This maps the forecast data LocationIDs (like "100 NET") to GeoJSON LocationIDs
  const dnnToGeoJsonMapping = {
    "100 NET": 100,
    "105 NET": 105,
    "107 NET": 107,
    "113 NET": 113,
    "114 NET": 114,
    "116 NET": 116,
    "120 NET": 120,
    "125 NET": 125,
    "127 NET": 127,
    "128 NET": 128,
    "137 NET": 137,
    "140 NET": 140,
    "141 NET": 141,
    "142 NET": 142,
    "143 NET": 143,
    "144 NET": 144,
    "148 NET": 148,
    "151 NET": 151,
    "152 NET": 152,
    "153 NET": 153,
    "158 NET": 158,
    "161 NET": 161,
    "162 NET": 162,
    "163 NET": 163,
    "164 NET": 164,
    "166 NET": 166,
    "170 NET": 170,
    "186 NET": 186,
    "194 NET": 194,
    "202 NET": 202,
    "209 NET": 209,
    "211 NET": 211,
    "224 NET": 224,
    "229 NET": 229,
    "230 NET": 230,
    "231 NET": 231,
    "232 NET": 232,
    "233 NET": 233,
    "234 NET": 234,
    "236 NET": 236,
    "237 NET": 237,
    "238 NET": 238,
    "239 NET": 239,
    "243 NET": 243,
    "244 NET": 244,
    "246 NET": 246,
    "249 NET": 249,
    "261 NET": 261,
    "262 NET": 262,
    "263 NET": 263,
    "4 NET": 4,
    "12 NET": 12,
    "13 NET": 13,
    "24 NET": 24,
    "41 NET": 41,
    "42 NET": 42,
    "43 NET": 43,
    "45 NET": 45,
    "48 NET": 48,
    "50 NET": 50,
    "68 NET": 68,
    "74 NET": 74,
    "75 NET": 75,
    "79 NET": 79,
    "87 NET": 87,
    "88 NET": 88,
    "90 NET": 90,
  };

  // Debug logging for forecast data
  useEffect(() => {
    if (currentMode === "forecast" && predictionData && predictionData.length > 0) {
      console.log("🔍 [DEBUG] Available forecast data:", predictionData.slice(0, 3));
      console.log("🔍 [DEBUG] Selected timestamp:", selectedTimestamp);
      
      // Log the first few LocationIDs to understand the structure
      const sampleIds = predictionData.slice(0, 5).map(p => p.LocationID);
      console.log("🔍 [DEBUG] Sample LocationIDs:", sampleIds);
      
      // Log the mapping for the first few zones
      const sampleMappings = sampleIds.map(id => ({
        dnnId: id,
        geoJsonId: dnnToGeoJsonMapping[id]
      }));
      console.log("🔍 [DEBUG] Sample mappings:", sampleMappings);
    }
  }, [currentMode, predictionData, selectedTimestamp]);

  // Update allVenuesRef when venues change
  useEffect(() => {
    allVenuesRef.current = venues;
  }, [venues]);

  // Auto-center map on route when directions are shown - with minimal movement
  const prevRouteCoordsRef = useRef(null);
  
  useEffect(() => {
    if (showDirections && routeCoords && routeCoords.length > 0 && mapRef.current) {
      // Only re-center if the route coordinates actually changed
      const coordsChanged = JSON.stringify(routeCoords) !== JSON.stringify(prevRouteCoordsRef.current);
      
      if (coordsChanged) {
        // Check if coordinates are valid numbers
        const validCoords = routeCoords.filter(coord => 
          Array.isArray(coord) && 
          coord.length === 2 && 
          typeof coord[0] === 'number' && 
          typeof coord[1] === 'number' &&
          !isNaN(coord[0]) && 
          !isNaN(coord[1])
        );
        
        if (validCoords.length > 0) {
          try {
            const bounds = L.latLngBounds(validCoords);
            // Use minimal padding and smooth animation
            mapRef.current.fitBounds(bounds, { 
              padding: [10, 10], // Reduced padding
              animate: true,
              duration: 0.8 // Slower, smoother animation
            });
          } catch (error) {
            console.error('Error setting map bounds:', error);
          }
        }
        
        // Update the ref to track the current coordinates
        prevRouteCoordsRef.current = JSON.stringify(routeCoords);
      }
    }
  }, [showDirections, routeCoords]);

  // choropleth styling
  const getColorForBusyness = (busyness) => {
    if (busyness >= 75) return "#FF0000";
    if (busyness >= 50) return "#FFA500";
    if (busyness >= 25) return "#FFFF00";
    return "#00FF00";
  };

  // Memoize the zone style function to prevent unnecessary re-renders
  const getZoneStyle = useCallback((feature) => {
    const locationId = feature.properties.LocationID;
    
    // match current timestamp for forecast mode or use live value
    const match = currentMode === "forecast"
      ? (() => {
          // First try to find exact timestamp match
          const zoneData = predictionData.find((z) => {
            // Use the mapping to convert DNN model names to GeoJSON LocationIDs
            const mappedZoneId = dnnToGeoJsonMapping[z.LocationID];
            const zoneId = String(locationId);
            return mappedZoneId && mappedZoneId.toString() === zoneId;
          });
          
          if (!zoneData || !zoneData.predictions || zoneData.predictions.length === 0) {
            return null;
          }
          
          // Try to find exact timestamp match
          const exactMatch = zoneData.predictions.find((p) => {
            try {
              const pTime = DateTime.fromISO(p.timestamp);
              const sTime = DateTime.fromISO(selectedTimestamp);
              return pTime.equals(sTime);
            } catch (error) {
              return false;
            }
          });
          
          // If no exact match, use the first available prediction
          if (!exactMatch && zoneData.predictions.length > 0) {
            return zoneData.predictions[0];
          }
          
          return exactMatch;
        })()
      : busynessData.find((z) => String(z.LocationID) === String(locationId));

    // fallback to grey if no match
    let fillColor;
    if (match) {
      if (currentMode === "forecast") {
        // For forecast data, normalize the raw values (-100 to +100) to 0-100%
        const normalizedBusyness = Math.max(0, Math.min(100, (match.busyness + 100) / 2));
        fillColor = getColorForBusyness(normalizedBusyness);
      } else {
        // For live data, the values are already normalized (0-1)
        fillColor = getColorForBusyness((match.busyness || 0) * 100);
      }
    } else {
      fillColor = "#CCCCCC";
    }
    

    
    return {
      fillColor,
      weight: 2,
      opacity: 1,
      color: "#3ABEFF",
      fillOpacity: 0.5,
    };
  }, [currentMode, predictionData, selectedTimestamp, busynessData, dnnToGeoJsonMapping, fromPlanProp]);

  // update and click handlers
  
  // when a zone is clicked - get LocationID from GeoJSON, important for zone exploration
  const handleZoneClick = useCallback((feature) => {
    const zoneId = feature.properties.LocationID;
    
    try {
      const filteredVenues = allVenuesRef.current.filter(
        (v) => String(v.zone) === String(zoneId)
      );
      setActiveZoneVenues(filteredVenues);
      setOverridePlanMode(true);              // ensures zone click takes precedence over previously loaded plans or selections
    } catch (err) {
      console.error("Failed to load venues for zone:", err);
      setActiveZoneVenues([]);
    }
  }, []);

  // Reset zone view when map is reset
  useEffect(() => {
    if (resetMapKey > 0) {
      setActiveZoneVenues([]);
      setOverridePlanMode(false);
    }
  }, [resetMapKey]);

  // hook to make each zone interactive and informative
  const onEachZone = useCallback((feature, layer) => {
    layer.on({
      mouseover: (e) => {
        e.target.setStyle({ weight: 3, color: "#ffffff", fillOpacity: 0.7 });
      },
      mouseout: (e) => {
        e.target.setStyle(getZoneStyle(feature));
      },
      click: (e) => {
        const bounds = e.target.getBounds();
        const center = bounds.getCenter();
        setZoneCenter(center);
        handleZoneClick(feature);
      },
    });

    const level =
      currentMode === "forecast"
        ? (() => {
          const match = predictionData
            .find((z) => {
              // Use the mapping to convert DNN model names to GeoJSON LocationIDs
              const mappedZoneId = dnnToGeoJsonMapping[z.LocationID];
              const zoneId = String(feature.properties.LocationID);
              return mappedZoneId && mappedZoneId.toString() === zoneId;
            })
            ?.predictions?.find((p) => {
              // Use Luxon's DateTime to compare timestamps in a timezone-agnostic way
              return DateTime.fromISO(p.timestamp).equals(DateTime.fromISO(selectedTimestamp));
            });
            // For forecast data, the busyness values are raw and need to be normalized
            // The values range from roughly -100 to +100, so we normalize to 0-100%
            const normalizedBusyness = match ? Math.max(0, Math.min(100, (match.busyness + 100) / 2)) : 0;
            return match ? `${normalizedBusyness.toFixed(0)}% busy` : "No forecast data";
          })()
        : (() => {
            const match = busynessData.find(
              (z) => String(z.LocationID) === String(feature.properties.LocationID)
            );
            return match ? `${(match.busyness * 100).toFixed(0)}% busy` : "No live data";
          })();

    layer.bindTooltip(
      `${feature.properties.zone || feature.properties.name || "Unnamed Zone"} — ${level}`,
      { sticky: true }
    );
  }, [currentMode, predictionData, selectedTimestamp, busynessData, dnnToGeoJsonMapping, getZoneStyle, setZoneCenter, handleZoneClick]);

// function toe smoothly pan and zoom to selected venues
function FlyToVenue({ venue, showDirections }) {
  const map = useMap();
  const hasZoomedRef = useRef(false); // track zoom state

  // Reset zoom when selected venue changes
  useEffect(() => {
    hasZoomedRef.current = false;
  }, [venue?.id]);

  // Only zoom when conditions are right - with minimal movement
  useEffect(() => {
    if (!venue?.lat || !venue?.lng || showDirections || hasZoomedRef.current) return;

    hasZoomedRef.current = true;

    const timeout = setTimeout(() => {
      // Use gentler zoom and smoother animation
      map.flyTo([venue.lat, venue.lng], 14, {
        duration: 1.2, // Slower animation
        easeLinearity: 0.25 // Smoother easing
      });
    }, 500);      // slight delay to wait for state transition

    return () => clearTimeout(timeout);
  }, [venue, showDirections, map]);

  return null;
}
  // zoom to zone centre - with minimal movement
  function FlyToZone({ center }) {
    const map = useMap();
    useEffect(() => {
      if (center) {
        map.flyTo([center.lat, center.lng], 14, {
          duration: 1.2, // Slower animation
          easeLinearity: 0.25 // Smoother easing
        });
      }
    }, [center]);
    return null;
  }

  function FlyToPlan({ venues, fromPlan }) {
    const map = useMap();
    const hasFittedBounds = useRef(false);

    // Defensive: ensure venues is always an array
    const safeVenues = Array.isArray(venues) ? venues : [];

    useEffect(() => {
      // only proceed if we are in "fromPlan" mode, there are one or more venues and all venues have valid coords
      if (
        !fromPlan ||
        !safeVenues ||
        safeVenues.length === 0 ||
        !safeVenues.every((v) => typeof v.lat === "number" && typeof v.lng === "number") ||
        hasFittedBounds.current
      ) {
        return; // exit early if conditions are not met or already fitted
      }

      hasFittedBounds.current = true;
      const bounds = L.latLngBounds(safeVenues.map((v) => [v.lat, v.lng]));      // convert coords to leaflet LatLng tuples
      // Use minimal padding and smooth animation
      map.fitBounds(bounds, { 
        padding: [20, 20], // Reduced padding
        animate: true,
        duration: 0.8 // Slower, smoother animation
      });
    }, [safeVenues, fromPlan, map]);                                            // re-run effect if venues or fromPlan changes

    // Reset the flag when fromPlan changes to false
    useEffect(() => {
      if (!fromPlan) {
        hasFittedBounds.current = false;
      }
    }, [fromPlan]);

    return null;
  }


  function FlyToUserLocation({ location }) {
    const map = useMap();
    useEffect(() => {
      if (location?.lat && location?.lng) {
        map.flyTo([location.lat, location.lng], 14, {
          duration: 1.2, // Slower animation
          easeLinearity: 0.25 // Smoother easing
        });
      }
    }, [location, map]);
    return null;
  }

  function ResetMap({ triggerKey }) {
    const map = useMap();
    useEffect(() => {
      map.setView([40.78, -74.0], 12.4);
    }, [triggerKey]);
    return null;
  }

  function FitToDirections({ routeCoords }) {
    const map = useMap();
    const hasFitted = useRef(false);

    useEffect(() => {
      if (!routeCoords || routeCoords.length === 0 || hasFitted.current) return;

      hasFitted.current = true;
      const bounds = L.latLngBounds(routeCoords);
      map.fitBounds(bounds, { 
        padding: [20, 20],
        animate: true,
        duration: 0.8
      });
    }, [routeCoords, map]);

    // Reset the flag when directions are hidden
    useEffect(() => {
      if (!routeCoords || routeCoords.length === 0) {
        hasFitted.current = false;
      }
    }, [routeCoords]);

    return null;
  }

  function ChoroplethLegend() {
    const map = useMap();
    useEffect(() => {
      const id = "leaflet-legend-style";
      if (!document.getElementById(id)) {
        const style = document.createElement("style");
        style.id = id;
        style.innerHTML = `
          .leaflet-control.legend {
            background: #1e1e1e;
            padding: 12px;
            font-size: 13px;
            line-height: 20px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.4);
            color: rgba(255, 255, 255, 0.87);
            font-family: 'Urbanist', sans-serif;
          }
          .leaflet-control.legend i {
            width: 18px;
            height: 18px;
            display: inline-block;
            margin-right: 8px;
            opacity: 0.8;
            border-radius: 4px;
          }
        `;
        document.head.appendChild(style);
      }

      const legend = L.control({ position: "bottomright" });
      legend.onAdd = () => {
        const div = L.DomUtil.create("div", "leaflet-control legend");
        const levels = [
          { label: "Quiet", color: getColorForBusyness(1) },
          { label: "Moderate", color: getColorForBusyness(26) },
          { label: "Busy", color: getColorForBusyness(51) },
          { label: "Very busy", color: getColorForBusyness(76) },
        ];
        div.innerHTML = levels.map((l) => `<i style="background:${l.color}"></i> ${l.label}`).join("<br>");
        return div;
      };

      legend.addTo(map);
      return () => legend.remove();
    }, [map]);

    return null;
  }

    const isZoneView = activeZoneVenues.length > 0;

    const displayedVenues = isZoneView
      ? activeZoneVenues
      : fromPlanProp && !overridePlanMode
      ? plan
      : selectedVenue
      ? [selectedVenue]
      : []; // don't render any markers by default

    // Defensive: ensure displayedVenues is always an array
    const safeDisplayedVenues = Array.isArray(displayedVenues) ? displayedVenues : [];
    const validVenues = useMemo(() => 
      safeDisplayedVenues.filter(
        v => v && typeof v.lat === 'number' && typeof v.lng === 'number'
      ),
      [safeDisplayedVenues]
    );



  return (
    <Box sx={{ width: "100%", height: "100%" }}>
      <MapContainer
        center={[40.78, -74.0]}
        zoom={12.4}
        scrollWheelZoom={false}
        whenCreated={(map) => {
          map.on("click", () => map.scrollWheelZoom.enable());
          mapRef.current = map; // Assign map to ref
        }}
        style={{ height: "calc(120vh - 300px)", width: "100%" }}
      >
        <FlyToUserLocation location={userLocation} />
        <ResetMap triggerKey={resetMapKey} />
        {/* Show FlyToPlan for plans, but disable it during forecast mode to prevent interference */}
        {fromPlanProp && currentMode !== "forecast" && <FlyToPlan venues={plan} fromPlan={fromPlanProp} />}
        {selectedVenue && !fromPlanProp && currentMode !== "forecast" && <FlyToVenue venue={selectedVenue} />}
        {zoneCenter && <FlyToZone center={zoneCenter} />}
        {showDirections && routeCoords && routeCoords.length > 0 && <FitToDirections routeCoords={routeCoords} />}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        {/* Only show zones when directions are not being shown */}
        {zoneData && !showDirections && (
          <GeoJSON
            key={`zones-${currentMode}`}
            data={zoneData}
            style={getZoneStyle}
            onEachFeature={onEachZone}
          />
        )}

        {/* Only show legend when directions are not being shown */}
        {!showDirections && <ChoroplethLegend />}
        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]}>
            <Tooltip direction="top" offset={[0, -10]} permanent>
              You are here
            </Tooltip>
          </Marker>
        )}
        {/* Show venue markers always, but with reduced opacity when directions are shown */}
        {validVenues.length > 0 && validVenues
          .map((venue) => {
            const type =
              venue.isRestaurant
                ? "restaurant"
                : venue.isBar
                ? "bar"
                : venue.isClub
                ? "club"
                : venue.isLandmark
                ? "landmark"
                : "default";

            return (
              <Marker
                key={`${venue.id}-${showDirections}`}
                position={[venue.lat, venue.lng]}
                icon={getVenueIcon(type)}
                opacity={showDirections ? 0.7 : 1}
                                  eventHandlers={{
                    click: () => {
                      onSelectVenue(venue);
                    },
                  }}
              >
                <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                  <strong>{venue.name}</strong>
                </Tooltip>
                <Popup>
                  <strong>{venue.name || "Unnamed Venue"}</strong>
                  <br />
                  {venue.address || "No address provided"}
                  <br />
                  <em>Zone: {venue.zone || "Unknown"}</em>
                </Popup>
              </Marker>
            );
          })}
        {userLocation && selectedVenue && !showDirections && currentMode !== "forecast" && (
          <MemoizedRouteDisplay
            start={[userLocation.lat, userLocation.lng]}
            end={[selectedVenue.lat, selectedVenue.lng]}
          />
        )}
        {showDirections && routeCoords && routeCoords.length > 0 && (
          <MemoizedPolyline 
            positions={routeCoords} 
            color="#FF4ECD" 
            weight={6}
            opacity={0.8}
          />
        )}
      </MapContainer>
    </Box>
  );
}
