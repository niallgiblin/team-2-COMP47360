// Map component, using leaflet, supports busyness overlay, forecast/live mode switching,
// routing directions, tooltips for each zone and venue. Used on MapView.jsx page.
//
// Stability: all fly-to/controller components live at module scope so React never
// unmounts them on parent re-render. A single MapController handles all pan/zoom
// operations with priority ordering to prevent competing animations.

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
import { getVenueIcon, getStartIcon, getDestinationIcon } from "../utils/mapIcons";
import { DateTime } from "luxon";

// ---------------------------------------------------------------------------
// Module-scope helpers and components (stable identity across DemoMap renders)
// ---------------------------------------------------------------------------

// Small marker that toggles its label on click
function ToggleLabelMarker({ position, icon, label }) {
  const [visible, setVisible] = useState(false);
  return (
    <Marker
      position={position}
      icon={icon}
      eventHandlers={{ click: () => setVisible((v) => !v) }}
    >
      {visible && (
        <Tooltip direction="top" offset={[0, -10]} permanent>
          {label}
        </Tooltip>
      )}
    </Marker>
  );
}

// Memoized Polyline to prevent unnecessary re-renders
const MemoizedPolyline = React.memo(({ positions, color, weight, opacity }) => (
  <Polyline positions={positions} color={color} weight={weight} opacity={opacity} />
));

// Memoized venue marker to prevent recreation on parent re-render
const VenueMarker = React.memo(({ venue, isSelected, isFromPlan, type, onSelect }) => {
  const markerRef = useRef(null);

  useEffect(() => {
    if (isSelected && !isFromPlan && markerRef.current) {
      // Use requestAnimationFrame instead of setTimeout for smoother timing
      const raf = requestAnimationFrame(() => {
        markerRef.current?.openPopup();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isSelected, isFromPlan]);

  return (
    <Marker
      ref={markerRef}
      position={[venue.lat, venue.lng]}
      icon={getVenueIcon(type)}
      eventHandlers={{ click: () => onSelect(venue) }}
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
});

/**
 * Single map controller — handles ALL pan/zoom/fit operations.
 * Priority (highest first):
 *   1. resetMapKey          — explicit user reset
 *   2. showDirections + routeCoords — directions active, fit to route
 *   3. zoneCenter           — zone was clicked
 *   4. selectedVenue        — venue selected (only when not from-plan)
 *   5. fromPlan + plan      — plan loaded, fit to all venues
 *   6. userLocation         — user set a start location
 */
function MapController({
  resetMapKey,
  showDirections,
  routeCoords,
  zoneCenter,
  selectedVenue,
  fromPlan,
  plan,
  userLocation,
  currentMode,
}) {
  const map = useMap();

  // Per-input "already handled" flags to avoid repeated fly-to's
  const lastResetKey = useRef(null);
  const lastRouteKey = useRef(null);
  const lastZoneCenter = useRef(null);
  const lastVenueId = useRef(null);
  const lastPlanKey = useRef(null);
  const lastUserLocKey = useRef(null);

  // --- Priority 1: Reset ---
  useEffect(() => {
    if (resetMapKey > 0 && resetMapKey !== lastResetKey.current) {
      lastResetKey.current = resetMapKey;
      map.setView([40.78, -74.0], 12.4, { animate: false });
    }
  }, [resetMapKey, map]);

  // --- Priority 2: Directions ---
  useEffect(() => {
    if (!showDirections || !routeCoords || routeCoords.length === 0) {
      lastRouteKey.current = null;
      return;
    }
    const routeKey = JSON.stringify(routeCoords);
    if (routeKey === lastRouteKey.current) return;

    const validCoords = routeCoords.filter(
      (c) => Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
    );
    if (validCoords.length === 0) return;

    lastRouteKey.current = routeKey;
    const bounds = L.latLngBounds(validCoords);
    map.fitBounds(bounds, { padding: [40, 40], animate: true, duration: 0.8 });
  }, [showDirections, routeCoords, map]);

  // --- Priority 3: Zone center ---
  useEffect(() => {
    if (!zoneCenter) return;
    const key = `${zoneCenter.lat},${zoneCenter.lng}`;
    if (key === lastZoneCenter.current) return;
    lastZoneCenter.current = key;
    map.flyTo([zoneCenter.lat, zoneCenter.lng], 14, { duration: 1.0, easeLinearity: 0.25 });
  }, [zoneCenter, map]);

  // --- Priority 4: Selected venue (only when NOT in forecast mode and NOT from-plan) ---
  useEffect(() => {
    if (showDirections || fromPlan || currentMode === "forecast" || !selectedVenue) return;
    if (!selectedVenue.lat || !selectedVenue.lng) return;
    if (selectedVenue.id === lastVenueId.current) return;

    lastVenueId.current = selectedVenue.id;
    const tid = setTimeout(() => {
      map.flyTo([selectedVenue.lat, selectedVenue.lng], 14, {
        duration: 1.0,
        easeLinearity: 0.25,
      });
    }, 300);
    return () => clearTimeout(tid);
  }, [selectedVenue, showDirections, fromPlan, currentMode, map]);

  // --- Priority 5: Plan ---
  useEffect(() => {
    if (showDirections || currentMode === "forecast") return;
    const safePlan = Array.isArray(plan) ? plan : [];
    if (!fromPlan || safePlan.length === 0) {
      lastPlanKey.current = null;
      return;
    }
    if (!safePlan.every((v) => typeof v.lat === "number" && typeof v.lng === "number")) return;

    const planKey = safePlan.map((v) => `${v.lat},${v.lng}`).join("|");
    if (planKey === lastPlanKey.current) return;

    lastPlanKey.current = planKey;
    const bounds = L.latLngBounds(safePlan.map((v) => [v.lat, v.lng]));
    map.fitBounds(bounds, { padding: [20, 20], animate: true, duration: 0.8 });
  }, [plan, fromPlan, showDirections, currentMode, map]);

  // --- Priority 6: User location ---
  useEffect(() => {
    if (showDirections || !userLocation?.lat || !userLocation?.lng) return;
    const key = `${userLocation.lat},${userLocation.lng}`;
    if (key === lastUserLocKey.current) return;
    lastUserLocKey.current = key;
    map.flyTo([userLocation.lat, userLocation.lng], 14, {
      duration: 1.0,
      easeLinearity: 0.25,
    });
  }, [userLocation, showDirections, map]);

  return null;
}

// Choropleth legend (adds a Leaflet control — runs once)
function ChoroplethLegend({ getColorForBusyness }) {
  const map = useMap();

  useEffect(() => {
    const styleId = "leaflet-legend-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.innerHTML = `
        .leaflet-control.legend {
          background: #1e1e1e;
          padding: 12px;
          font-size: 13px;
          line-height: 20px;
          border-radius: 8px;
          box-shadow: 0 0 10px rgba(0,0,0,0.4);
          color: rgba(255,255,255,0.87);
          font-family: 'Urbanist', sans-serif;
        }
        .leaflet-control.legend i {
          width: 18px; height: 18px; display: inline-block;
          margin-right: 8px; opacity: 0.8; border-radius: 4px;
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
      div.innerHTML = levels
        .map((l) => `<i style="background:${l.color}"></i> ${l.label}`)
        .join("<br>");
      return div;
    };

    legend.addTo(map);
    return () => legend.remove();
  }, [map, getColorForBusyness]);

  return null;
}

// ---------------------------------------------------------------------------
// Static data and Leaflet icon config
// ---------------------------------------------------------------------------

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const DNN_TO_GEOJSON_MAPPING = {
  "100 NET": 100, "105 NET": 105, "107 NET": 107, "113 NET": 113,
  "114 NET": 114, "116 NET": 116, "120 NET": 120, "125 NET": 125,
  "127 NET": 127, "128 NET": 128, "137 NET": 137, "140 NET": 140,
  "141 NET": 141, "142 NET": 142, "143 NET": 143, "144 NET": 144,
  "148 NET": 148, "151 NET": 151, "152 NET": 152, "153 NET": 153,
  "158 NET": 158, "161 NET": 161, "162 NET": 162, "163 NET": 163,
  "164 NET": 164, "166 NET": 166, "170 NET": 170, "186 NET": 186,
  "194 NET": 194, "202 NET": 202, "209 NET": 209, "211 NET": 211,
  "224 NET": 224, "229 NET": 229, "230 NET": 230, "231 NET": 231,
  "232 NET": 232, "233 NET": 233, "234 NET": 234, "236 NET": 236,
  "237 NET": 237, "238 NET": 238, "239 NET": 239, "243 NET": 243,
  "244 NET": 244, "246 NET": 246, "249 NET": 249, "261 NET": 261,
  "262 NET": 262, "263 NET": 263,
  "4 NET": 4,   "12 NET": 12,  "13 NET": 13,  "24 NET": 24,
  "41 NET": 41,  "42 NET": 42,  "43 NET": 43,  "45 NET": 45,
  "48 NET": 48,  "50 NET": 50,  "68 NET": 68,  "74 NET": 74,
  "75 NET": 75,  "79 NET": 79,  "87 NET": 87,  "88 NET": 88,
  "90 NET": 90,
};

function getColorForBusyness(busyness) {
  if (busyness >= 75) return "#FF0000";
  if (busyness >= 50) return "#FFA500";
  if (busyness >= 25) return "#FFFF00";
  return "#00FF00";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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
  destination = null,
  startLabel = "Start",
  destinationLabel = "Destination",
  fromPlan: fromPlanProp,
}) {
  const [activeZoneVenues, setActiveZoneVenues] = useState([]);
  const [overridePlanMode, setOverridePlanMode] = useState(false);
  const geoJsonLayerRef = useRef(null);
  const allVenuesRef = useRef([]);
  const currentMode = mode;

  // Keep allVenuesRef current without triggering re-renders
  useEffect(() => {
    allVenuesRef.current = venues;
  }, [venues]);

  // --- Zone click handler ---
  const handleZoneClick = useCallback((feature) => {
    const zoneId = feature.properties.LocationID;
    try {
      const filtered = allVenuesRef.current.filter(
        (v) => String(v.zone) === String(zoneId)
      );
      setActiveZoneVenues(filtered);
      setOverridePlanMode(true);
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

  // Clear zone override when plan becomes active
  useEffect(() => {
    if (fromPlanProp && plan && plan.length > 0) {
      setOverridePlanMode(false);
      setActiveZoneVenues([]);
    }
  }, [fromPlanProp, plan]);

  // --- Forecast/live data helpers ---
  const getForecastPoint = useCallback((locationId) => {
    const zoneEntry = predictionData.find((z) => {
      const mappedId = DNN_TO_GEOJSON_MAPPING[z.LocationID];
      return mappedId && String(mappedId) === String(locationId);
    });
    if (!zoneEntry?.predictions?.length) return null;

    if (selectedTimestamp) {
      const exact = zoneEntry.predictions.find((p) => {
        try {
          return DateTime.fromISO(p.timestamp).equals(DateTime.fromISO(selectedTimestamp));
        } catch {
          return false;
        }
      });
      if (exact) return exact;
    }
    return zoneEntry.predictions[0];
  }, [predictionData, selectedTimestamp]);

  const getBusynessLabelForFeature = useCallback((feature) => {
    const locationId = feature.properties.LocationID;
    const zoneName = feature.properties.zone || feature.properties.name || "Unnamed Zone";

    if (currentMode === "forecast") {
      const point = getForecastPoint(locationId);
      if (!point) return `${zoneName} — No forecast data`;
      const normalized = Math.max(0, Math.min(100, (point.busyness + 100) / 2));
      return `${zoneName} — ${normalized.toFixed(0)}% busy`;
    }

    const match = busynessData.find((z) => String(z.LocationID) === String(locationId));
    if (!match) return `${zoneName} — No live data`;
    return `${zoneName} — ${(match.busyness * 100).toFixed(0)}% busy`;
  }, [currentMode, busynessData, getForecastPoint]);

  // --- Zone style — memoized to prevent GeoJSON re-render churn ---
  const getZoneStyle = useCallback((feature) => {
    const locationId = feature.properties.LocationID;

    const match =
      currentMode === "forecast"
        ? getForecastPoint(locationId)
        : busynessData.find((z) => String(z.LocationID) === String(locationId));

    let fillColor;
    if (match) {
      if (currentMode === "forecast") {
        fillColor = getColorForBusyness(
          Math.max(0, Math.min(100, (match.busyness + 100) / 2))
        );
      } else {
        fillColor = getColorForBusyness((match.busyness || 0) * 100);
      }
    } else {
      fillColor = "#CCCCCC";
    }

    return { fillColor, weight: 2, opacity: 1, color: "#3ABEFF", fillOpacity: 0.5 };
  }, [currentMode, busynessData, getForecastPoint]);

  // --- Zone interaction — uses stable ref for imperative updates ---
  // We keep the GeoJSON key STABLE so the layer never unmounts.
  // Mode/timestamp changes are handled imperatively via the ref.
  // Each layer stores its feature so the imperative effect can call the
  // CURRENT getZoneStyle / getBusynessLabelForFeature (not a stale closure).
  const onEachZone = useCallback((feature, layer) => {
    // Store the feature on the layer for imperative style updates
    layer._urbanFeature = feature;

    layer.on({
      mouseover: (e) => {
        e.target.setTooltipContent(getBusynessLabelForFeature(feature));
        e.target.setStyle({ ...getZoneStyle(feature), weight: 3, color: "#ffffff", fillOpacity: 0.7 });
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

  // Imperatively refresh GeoJSON styles and tooltips when data/mode changes.
  // Uses the CURRENT callbacks (not stale closures stored on layers).
  useEffect(() => {
    const layer = geoJsonLayerRef.current;
    if (!layer) return;

    layer.eachLayer((l) => {
      if (l._urbanFeature) {
        l.setStyle(getZoneStyle(l._urbanFeature));
        l.setTooltipContent(getBusynessLabelForFeature(l._urbanFeature));
      }
    });
  }, [currentMode, selectedTimestamp, getZoneStyle, getBusynessLabelForFeature]);

  // --- Displayed venues ---
  const isZoneView = overridePlanMode && activeZoneVenues.length > 0;

  const displayedVenues = useMemo(() => {
    if (fromPlanProp) return Array.isArray(plan) ? plan : [];
    if (isZoneView) return activeZoneVenues;
    if (selectedVenue) return [selectedVenue];
    return [];
  }, [fromPlanProp, isZoneView, plan, activeZoneVenues, selectedVenue]);

  const validVenues = useMemo(
    () =>
      displayedVenues.filter(
        (v) => v && typeof v.lat === "number" && typeof v.lng === "number"
      ),
    [displayedVenues]
  );

  // Memoize the venue type derivation so marker icons are stable
  const getVenueType = useCallback((venue) => {
    if (venue.isRestaurant) return "restaurant";
    if (venue.isBar) return "bar";
    if (venue.isClub) return "club";
    if (venue.isLandmark) return "landmark";
    return "default";
  }, []);

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
        {/* Single controller for all pan/zoom operations */}
        <MapController
          resetMapKey={resetMapKey}
          showDirections={showDirections}
          routeCoords={routeCoords}
          zoneCenter={zoneCenter}
          selectedVenue={selectedVenue}
          fromPlan={fromPlanProp}
          plan={plan}
          userLocation={userLocation}
          currentMode={currentMode}
        />

        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {/* GeoJSON — STABLE key, styles updated imperatively on mode change */}
        {zoneData && (
          <GeoJSON
            ref={geoJsonLayerRef}
            key="zones-stable"
            data={zoneData}
            style={getZoneStyle}
            onEachFeature={onEachZone}
          />
        )}

        <ChoroplethLegend getColorForBusyness={getColorForBusyness} />

        {/* Start / destination markers */}
        {userLocation && (
          <ToggleLabelMarker
            position={[userLocation.lat, userLocation.lng]}
            icon={getStartIcon()}
            label={startLabel}
          />
        )}
        {destination && (
          <ToggleLabelMarker
            position={[destination.lat, destination.lng]}
            icon={getDestinationIcon()}
            label={destinationLabel}
          />
        )}

        {/* Venue markers — each memoized to prevent recreation */}
        {validVenues.map((venue) => (
          <VenueMarker
            key={venue.id}
            venue={venue}
            isSelected={
              selectedVenue &&
              String(venue.id) === String(selectedVenue.id)
            }
            isFromPlan={fromPlanProp}
            type={getVenueType(venue)}
            onSelect={onSelectVenue}
          />
        ))}

        {/* Route polyline */}
        {showDirections && routeCoords && routeCoords.length > 0 && (
          <MemoizedPolyline
            positions={routeCoords}
            color="#FF4ECD"
            weight={6}
            opacity={0.9}
          />
        )}
      </MapContainer>
    </Box>
  );
}

export default React.memo(DemoMap);
