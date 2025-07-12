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
import RouteDisplay from "./RouteDisplay";
import L from "leaflet";
import { getVenueIcon } from "../utils/mapIcons";

import { usePlan } from "../context/PlanContext";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

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
  fromPlan: fromPlanProp, // 🔄 renamed
}) {
  const [routeKey, setRouteKey] = useState(0);
  const [activeZoneVenues, setActiveZoneVenues] = useState([]);
  const allVenuesRef = useRef([]);
  const { selectedVenue } = usePlan(); // ⛔️ don't use fromPlan from context anymore

  const getColorForBusyness = (busyness) => {
    if (busyness >= 75) return "#FF0000";
    if (busyness >= 50) return "#FFA500";
    if (busyness >= 25) return "#FFFF00";
    return "#00FF00";
  };

  const getZoneStyle = (feature) => {
    const locationId = feature.properties.LocationID;
    const match =
      mode === "forecast"
        ? predictionData
            .find((z) => String(z.LocationID) === String(locationId))
            ?.predictions?.find((p) => p.timestamp === selectedTimestamp)
        : busynessData.find(
            (z) => String(z.LocationID) === String(locationId)
          );

    const fillColor = match ? getColorForBusyness((match.busyness || 0) * 100) : "#CCCCCC";

    return {
      fillColor,
      weight: 2,
      opacity: 1,
      color: "#3ABEFF",
      fillOpacity: 0.5,
    };
  };

  useEffect(() => {
    allVenuesRef.current = venues;
  }, [venues]);

  const handleZoneClick = (feature) => {
    const zoneId = feature.properties.LocationID;
    try {
      const filteredVenues = allVenuesRef.current.filter(
        (v) => String(v.zone) === String(zoneId)
      );
      setActiveZoneVenues(filteredVenues);
    } catch (err) {
      console.error("Failed to load venues for zone:", err);
      setActiveZoneVenues([]);
    }
  };

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
      mode === "forecast"
        ? (() => {
            const match = predictionData
              .find((z) => String(z.LocationID) === String(feature.properties.LocationID))
              ?.predictions?.find((p) => p.timestamp === selectedTimestamp);
            return match ? `${(match.busyness * 100).toFixed(0)}% busy` : "No forecast data";
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

  function FlyToVenue({ venue }) {
    const map = useMap();
    useEffect(() => {
      if (venue?.lat && venue?.lng) {
        const timeout = setTimeout(() => map.flyTo([venue.lat, venue.lng], 15), 300);
        return () => clearTimeout(timeout);
      }
    }, [venue, map]);
    return null;
  }

  function FlyToZone({ center }) {
    const map = useMap();
    useEffect(() => {
      if (center) map.flyTo([center.lat, center.lng], 15);
    }, [center]);
    return null;
  }

  function FlyToPlan({ venues, fromPlan }) {
    const map = useMap();
    useEffect(() => {
      if (
        !fromPlan ||
        !venues ||
        venues.length === 0 ||
        !venues.every((v) => typeof v.lat === "number" && typeof v.lng === "number")
      ) {
        return;
      }

      const coords = venues.map((v) => [v.lat, v.lng]);

      if (coords.length === 1) {
        map.flyTo(coords[0], 15);
      } else {
        const latSum = coords.reduce((sum, [lat]) => sum + lat, 0);
        const lngSum = coords.reduce((sum, [, lng]) => sum + lng, 0);
        map.flyTo([latSum / coords.length, lngSum / coords.length], 14);
      }
    }, [venues, fromPlan, map]);

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

  const displayedVenues = fromPlanProp
    ? plan
    : activeZoneVenues.length > 0
    ? activeZoneVenues
    : selectedVenue
    ? [selectedVenue]
    : venues;

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
        <ChoroplethLegend />
        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]}>
            <Tooltip direction="top" offset={[0, -10]} permanent>
              You are here
            </Tooltip>
          </Marker>
        )}
        {zoneData && (
          <GeoJSON
            key={`${mode}-${selectedTimestamp}`}
            data={zoneData}
            style={getZoneStyle}
            onEachFeature={onEachZone}
          />
        )}
        {displayedVenues
          .filter((v) => v?.lat && v?.lng)
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
