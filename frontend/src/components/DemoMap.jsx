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
import { useEffect, useState, useRef } from "react";
import RouteDisplay from "./RouteDisplay";            // custom component for routing
import L from "leaflet";
import { getVenueIcon } from "../utils/mapIcons";

import { usePlan } from "../context/PlanContext";
import { DateTime } from "luxon";                     // library for handling time zones, datetime formatting

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
  const [routeKey, setRouteKey] = useState(0);
  const [activeZoneVenues, setActiveZoneVenues] = useState([]);
  const allVenuesRef = useRef([]);
  const { selectedVenue } = usePlan();
  const [overridePlanMode, setOverridePlanMode] = useState(false);  // disables plan display if zone is manually clicked

  // Force live mode when viewing a plan (fromPlan)
  const [internalMode, setInternalMode] = useState(mode);
  useEffect(() => {
    if (fromPlanProp) {
      setInternalMode("live");
    } else {
      setInternalMode(mode);
    }
  }, [fromPlanProp, mode]);

  // choropleth styling
  const getColorForBusyness = (busyness) => {
    if (busyness >= 75) return "#FF0000";
    if (busyness >= 50) return "#FFA500";
    if (busyness >= 25) return "#FFFF00";
    return "#00FF00";
  };

  const getZoneStyle = (feature) => {
  const locationId = feature.properties.LocationID;
  
  // match current timestamp for forecast mode or use live value
  const match = internalMode === "forecast"
    ? predictionData
        .find((z) => {
          // Handle LocationID format mismatch: prediction data has " NET" suffix, GeoJSON doesn't
          const predictionId = String(z.LocationID).replace(" NET", "");
          const zoneId = String(locationId);
          return predictionId === zoneId;
        })
        ?.predictions?.find((p) => {
          // Use Luxon's DateTime to compare timestamps in a timezone-agnostic way
          const pTime = DateTime.fromISO(p.timestamp);
          const sTime = DateTime.fromISO(selectedTimestamp);
          const isMatch = pTime.equals(sTime);
          if (String(locationId) === "140") {
            console.log("🔍 [DEBUG] Forecast matching:", { locationId, pTime: pTime.toISO(), sTime: sTime.toISO(), match: isMatch });
          }
          return isMatch;
        })
    : busynessData.find((z) => String(z.LocationID) === String(locationId));

    // Debug logging for forecast mode
    if (internalMode === "forecast" && String(locationId) === "140") {
      console.log("🔍 [DEBUG] Forecast data for zone 140:", {
        predictionDataLength: predictionData.length,
        zoneData: predictionData.find((z) => String(z.LocationID).replace(" NET", "") === String(locationId)),
        selectedTimestamp,
        match
      });
    }

    // fallback to grey if no match
    let fillColor;
    if (match) {
      if (internalMode === "forecast") {
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
    
    // Debug logging for forecast mode to see the actual values
    if (internalMode === "forecast" && String(locationId) === "140") {
      console.log("🔍 [DEBUG] Forecast busyness value for zone 140:", {
        rawBusyness: match?.busyness,
        normalizedValue: match ? Math.max(0, Math.min(100, (match.busyness + 100) / 2)) : 0,
        color: fillColor
      });
    }
    
    return {
      fillColor,
      weight: 2,
      opacity: 1,
      color: "#3ABEFF",
      fillOpacity: 0.5,
    };
  };

  // update and click handlers
  
  // stores latest array of venues in allVenuesRef, enables efficient filtering inside other functions
  useEffect(() => {
    allVenuesRef.current = venues;
  }, [venues]);

  // when a zone is clicked - get LocationID from GeoJSON, important for zone exploration
  const handleZoneClick = (feature) => {
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
  };

  // hook to make each zone interactive and informative
  const onEachZone = (feature, layer) => {
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
      internalMode === "forecast"
        ? (() => {
          const match = predictionData
            .find((z) => {
              // Handle LocationID format mismatch: prediction data has " NET" suffix, GeoJSON doesn't
              const predictionId = String(z.LocationID).replace(" NET", "");
              const zoneId = String(feature.properties.LocationID);
              return predictionId === zoneId;
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
  };

// function toe smoothly pan and zoom to selected venues
function FlyToVenue({ venue, showDirections }) {
  const map = useMap();
  const hasZoomedRef = useRef(false); // track zoom state

  // Reset zoom when selected venue changes
  useEffect(() => {
    hasZoomedRef.current = false;
  }, [venue?.id]);

  // Only zoom when conditions are right
  useEffect(() => {
    if (!venue?.lat || !venue?.lng || showDirections || hasZoomedRef.current) return;

    hasZoomedRef.current = true;

    const timeout = setTimeout(() => {
      map.flyTo([venue.lat, venue.lng], 15);
    }, 500);      // slight delay to wait for state transition

    return () => clearTimeout(timeout);
  }, [venue, showDirections, map]);

  return null;
}
  // zoom to zone centre
  function FlyToZone({ center }) {
    const map = useMap();
    useEffect(() => {
      if (center) map.flyTo([center.lat, center.lng], 15);
    }, [center]);
    return null;
  }

  function FlyToPlan({ venues, fromPlan }) {
    const map = useMap();

    // Defensive: ensure venues is always an array
    const safeVenues = Array.isArray(venues) ? venues : [];

    useEffect(() => {
      // only proceed if we are in "fromPlan" mode, there are one or more venues and all venues have valid coords
      if (
        !fromPlan ||
        !safeVenues ||
        safeVenues.length === 0 ||
        !safeVenues.every((v) => typeof v.lat === "number" && typeof v.lng === "number")
      ) {
        return; // exit early if conditions are not met
      }

      const bounds = L.latLngBounds(safeVenues.map((v) => [v.lat, v.lng]));      // convert coords to leaflet LatLng tuples
      map.fitBounds(bounds, { padding: [40, 40] });                         // instruct the map to zoom and pan so all venues are visible, add padding around markers for clarity
    }, [safeVenues, fromPlan, map]);                                            // re-run effect if venues or fromPlan changes

    return null;
  }


  function FlyToUserLocation({ location }) {
    const map = useMap();
    useEffect(() => {
      if (location?.lat && location?.lng) {
        map.flyTo([location.lat, location.lng], 15);
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
    const validVenues = safeDisplayedVenues.filter(
      v => v && typeof v.lat === 'number' && typeof v.lng === 'number'
    );

  return (
    <Box sx={{ width: "100%", height: "100%" }}>
      <MapContainer
        center={[40.78, -74.0]}
        zoom={12.4}
        scrollWheelZoom={false}
        whenCreated={(map) => {
          map.on("click", () => map.scrollWheelZoom.enable());
        }}
        style={{ height: "calc(120vh - 300px)", width: "100%" }}
      >
        <FlyToUserLocation location={userLocation} />
        <ResetMap triggerKey={resetMapKey} />
        <FlyToPlan venues={plan} fromPlan={fromPlanProp} />
        {selectedVenue && !fromPlanProp && <FlyToVenue venue={selectedVenue} />}
        {zoneCenter && <FlyToZone center={zoneCenter} />}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        {/* Only show legend and zones if directions are not being shown */}
        {!showDirections && <ChoroplethLegend />}
        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]}>
            <Tooltip direction="top" offset={[0, -10]} permanent>
              You are here
            </Tooltip>
          </Marker>
        )}
        {/* Only show zones if directions are not being shown */}
        {zoneData && !showDirections && (
          <GeoJSON
            key={`${internalMode}-${selectedTimestamp}`}
            data={zoneData}
            style={getZoneStyle}
            onEachFeature={onEachZone}
          />
        )}


        
        {validVenues
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
                key={venue.id}
                position={[venue.lat, venue.lng]}
                icon={getVenueIcon(type)}
                eventHandlers={{
                  click: () => {
                    onSelectVenue(venue);
                    setRouteKey((prev) => prev + 1);
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
        {userLocation && selectedVenue && (
          <RouteDisplay
            key={routeKey}
            start={[userLocation.lat, userLocation.lng]}
            end={[selectedVenue.lat, selectedVenue.lng]}
          />
        )}
        {showDirections && routeCoords.length > 0 && (
          <Polyline 
            positions={routeCoords} 
            color="#FF4ECD" 
            weight={4}
          />
        )}
      </MapContainer>
    </Box>
  );
}
