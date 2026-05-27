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
import L from "leaflet";
import { getVenueIcon } from "../utils/mapIcons";

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

function DemoMap({
  venues = [],
  selectedVenue = null,
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
  const [overridePlanMode, setOverridePlanMode] = useState(false);  // disables plan display if zone is manually clicked
  const mapRef = useRef(null);
  const geoJsonLayerRef = useRef(null);

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

      
      // Log the first few LocationIDs to understand the structure
      const sampleIds = predictionData.slice(0, 5).map(p => p.LocationID);
      
      
      // Log the mapping for the first few zones
      const sampleMappings = sampleIds.map(id => ({
        dnnId: id,
        geoJsonId: dnnToGeoJsonMapping[id]
      }));
      
    }
  }, [currentMode, predictionData, selectedTimestamp]);

  // Update allVenuesRef when venues change
  useEffect(() => {
    allVenuesRef.current = venues;
  }, [venues]);

  // choropleth styling
  const getColorForBusyness = (busyness) => {
    if (busyness >= 75) return "#FF0000";
    if (busyness >= 50) return "#FFA500";
    if (busyness >= 25) return "#FFFF00";
    return "#00FF00";
  };

  const getForecastPoint = useCallback((locationId) => {
    const zoneEntry = predictionData.find((z) => {
      const mappedZoneId = dnnToGeoJsonMapping[z.LocationID];
      return mappedZoneId && mappedZoneId.toString() === String(locationId);
    });

    if (!zoneEntry?.predictions?.length) {
      return null;
    }

    if (selectedTimestamp) {
      const exactMatch = zoneEntry.predictions.find((p) => {
        try {
          return DateTime.fromISO(p.timestamp).equals(DateTime.fromISO(selectedTimestamp));
        } catch {
          return false;
        }
      });
      if (exactMatch) {
        return exactMatch;
      }
    }

    return zoneEntry.predictions[0];
  }, [predictionData, selectedTimestamp, dnnToGeoJsonMapping]);

  const getBusynessLabelForFeature = useCallback((feature) => {
    const locationId = feature.properties.LocationID;
    const zoneName = feature.properties.zone || feature.properties.name || "Unnamed Zone";

    if (currentMode === "forecast") {
      const point = getForecastPoint(locationId);
      if (!point) {
        return `${zoneName} — No forecast data`;
      }
      const normalizedBusyness = Math.max(0, Math.min(100, (point.busyness + 100) / 2));
      return `${zoneName} — ${normalizedBusyness.toFixed(0)}% busy`;
    }

    const match = busynessData.find((z) => String(z.LocationID) === String(locationId));
    if (!match) {
      return `${zoneName} — No live data`;
    }
    return `${zoneName} — ${(match.busyness * 100).toFixed(0)}% busy`;
  }, [currentMode, busynessData, getForecastPoint]);

  // Memoize the zone style function to prevent unnecessary re-renders
  const getZoneStyle = useCallback((feature) => {
    const locationId = feature.properties.LocationID;

    const match = currentMode === "forecast"
      ? getForecastPoint(locationId)
      : busynessData.find((z) => String(z.LocationID) === String(locationId));

    let fillColor;
    if (match) {
      if (currentMode === "forecast") {
        const normalizedBusyness = Math.max(0, Math.min(100, (match.busyness + 100) / 2));
        fillColor = getColorForBusyness(normalizedBusyness);
      } else {
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
  }, [currentMode, busynessData, getForecastPoint]);

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
        const baseStyle = getZoneStyle(feature);
        e.target.setTooltipContent(getBusynessLabelForFeature(feature));
        e.target.setStyle({ ...baseStyle, weight: 3, color: "#ffffff", fillOpacity: 0.7 });
      },
      mouseout: (e) => {
        if (geoJsonLayerRef.current) {
          geoJsonLayerRef.current.resetStyle(e.target);
        } else {
          e.target.setStyle(getZoneStyle(feature));
        }
      },
      click: (e) => {
        const bounds = e.target.getBounds();
        const center = bounds.getCenter();
        setZoneCenter(center);
        handleZoneClick(feature);
      },
    });

    layer.bindTooltip(getBusynessLabelForFeature(feature), { sticky: true });
  }, [getZoneStyle, getBusynessLabelForFeature, setZoneCenter, handleZoneClick]);

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

  function FitToDirections({ routeCoords, active }) {
    const map = useMap();
    const lastRouteKeyRef = useRef(null);

    useEffect(() => {
      if (!active) {
        lastRouteKeyRef.current = null;
        return;
      }
      if (!routeCoords || routeCoords.length === 0) return;

      const routeKey = JSON.stringify(routeCoords);
      if (routeKey === lastRouteKeyRef.current) return;

      const validCoords = routeCoords.filter(
        (coord) =>
          Array.isArray(coord) &&
          coord.length === 2 &&
          typeof coord[0] === "number" &&
          typeof coord[1] === "number" &&
          !isNaN(coord[0]) &&
          !isNaN(coord[1])
      );
      if (validCoords.length === 0) return;

      lastRouteKeyRef.current = routeKey;
      const bounds = L.latLngBounds(validCoords);
      map.fitBounds(bounds, {
        padding: [40, 40],
        animate: true,
        duration: 0.8,
      });
    }, [routeCoords, active, map]);

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
        {!showDirections && <FlyToUserLocation location={userLocation} />}
        <ResetMap triggerKey={resetMapKey} />
        {!showDirections && fromPlanProp && currentMode !== "forecast" && (
          <FlyToPlan venues={plan} fromPlan={fromPlanProp} />
        )}
        {!showDirections && selectedVenue && !fromPlanProp && currentMode !== "forecast" && (
          <FlyToVenue venue={selectedVenue} showDirections={showDirections} />
        )}
        {!showDirections && zoneCenter && <FlyToZone center={zoneCenter} />}
        {showDirections && routeCoords && routeCoords.length > 0 && (
          <FitToDirections routeCoords={routeCoords} active={showDirections} />
        )}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        {/* Only show zones when directions are not being shown */}
        {zoneData && !showDirections && (
          <GeoJSON
            ref={geoJsonLayerRef}
            key={`zones-${currentMode}-${selectedTimestamp}-${predictionData.length}`}
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

export default React.memo(DemoMap);
