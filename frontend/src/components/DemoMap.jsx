// Imports from react-leaflet to build the map, with markers, popups, GeoJSON etc
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet'; // Components for rendering the map and it's elements

import { Typography, Button, Box } from '@mui/material'; // Box is a layout component from MUI
import { useEffect, useState } from 'react'; // react hooks for managing component state

import RouteDisplay from './RouteDisplay';
import L from "leaflet";

// Fix for default marker icons in React-Leaflet
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Override Leaflet's default marker icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Main map component
export default function DemoMap({ venues = [], selectedVenue, onSelectVenue }) {
  
  // GeoJSON zone boundaries
  const [zoneData, setZoneData] = useState(null);

  // busyness values from the backend API
  const [busynessData, setBusynessData] = useState([]);

  // tracks if the zone data has finished loading
  const [zoneDataLoaded, setZoneDataLoaded] = useState(false);

  // tracks if the user has manually selected a venue
  const [userTriggeredFly, setUserTriggeredFly] = useState(false);

  // stores user's geolocation
  const [userLocation, setUserLocation] = useState(null);
  
  // manual address input for start location
  const [manualStart, setManualStart] = useState("");
  
  // Force re-render of RouteDisplay
  const [routeKey, setRouteKey] = useState(0);

  // Function to get colour based busyness score
  const getColorForBusyness = (busyness) => {
    if (busyness >= 75) return "#FF0000"; // High - Red
    if (busyness >= 50) return "#FFA500"; // Medium - Orange
    if (busyness >= 25) return "#FFFF00"; // Low - Yellow
    return "#00FF00"; // Very low - Green
  };
  
  // Dynamically determine zone styling based on busyness data
  const getZoneStyle = (feature) => {
    const locationId = feature.properties.LocationID;
    const match = busynessData.find((z) => z.LocationID === locationId);
    const fillColor = match ? getColorForBusyness(match.busyness * 100) : "#CCCCCC"; // Grey if no data
  
    return {
      fillColor,
      weight: 2,
      opacity: 1,
      color: "#3ABEFF",
      fillOpacity: 0.5,
    };
  };
  
  

  // load the GeoJSON zone data when component mounts
  useEffect(() => {
    fetch("/manhattanZones.geojson")
      .then((res) => res.json())
      .then((data) => {
        setZoneData(data); // save the zone data
        setZoneDataLoaded(true); // mark it as loaded
      })
      .catch(console.error);
  }, []);

  // retrieve live busyness data
  useEffect(() => {
    fetch("/api/zones/busyness")
      .then((res) => res.json())
      .then((data) => setBusynessData(data))
      .catch(console.error);
  }, []);
  

  // Set interactivity for each zone feature (mouseover, mouseout, click) 
  const onEachZone = (feature, layer) => {
    layer.on({
      mouseover: (e) => {
        // highlight on hover
        e.target.setStyle({
          weight: 3,
          color: "#ffffff",
          fillOpacity: 0.7,
        });
      },
      mouseout: (e) => {
        // reset to default style when mouse leaves
        const originalStyle = getZoneStyle(feature);
        e.target.setStyle(originalStyle);
      },
      click: () => {
        alert(
          `You clicked on zone: ${feature.properties.zone || feature.properties.name || "Unnamed Area"}`
        );
      },
    });
  };
  

  // component to fly to a selected venue
  function FlyToVenue({ venue }) {
    const map = useMap();

    useEffect(() => {
      // only fly if triggered by user, and all data is available
      if (
        userTriggeredFly &&
        zoneDataLoaded &&
        venue &&
        typeof venue.lat === "number" &&
        typeof venue.lng === "number"
      ) {
        const timeout = setTimeout(() => {
          map.flyTo([venue.lat, venue.lng], 15);
        }, 300);

        return () => clearTimeout(timeout);
      }
    }, [venue, map]); // only depend on venue and map to avoid stale closures

    return null;
  }

  // get user location
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        console.warn("Could not get user location:", error);
      }
    );
  }, []);

  // attempt to get user's geoloaction on page load
  const handleGeocodeStart = () => {
    if (!manualStart.trim()) return;

    const encoded = encodeURIComponent(manualStart.trim());

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encoded}`)
      .then((res) => res.json())
      .then((results) => {
        if (results.length > 0) {
          const firstResult = results[0];
          setUserLocation({
            lat: parseFloat(firstResult.lat),
            lng: parseFloat(firstResult.lon),
          });
        } else {
          alert("Address not found. Try being more specific.");
        }
      })
      .catch((err) => {
        console.error("Geocoding error:", err);
        alert("Failed to find location.");
      });
  };

  // Main render
  return (
    // Use MUI's box component as a container
    <Box
      sx={{
        width: "100%",
        height: "100%",
      }}
    >
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="white" sx={{ mb: 1 }}>
          Starting point (optional):
        </Typography>
        <input
          type="text"
          placeholder="Enter address or postcode"
          value={manualStart}
          onChange={(e) => setManualStart(e.target.value)}
          style={{
            padding: "8px",
            width: "100%",
            maxWidth: "300px",
            borderRadius: "4px",
            border: "1px solid #888",
          }}
        />
        <Button
          variant="contained"
          onClick={handleGeocodeStart}
          sx={{ mt: 1, ml: 2 }}
        >
          Set Start
        </Button>
      </Box>

      {/* Initialise the map container */}
      <MapContainer
        center={[40.72, -74.0]}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
      >
        {selectedVenue && <FlyToVenue venue={selectedVenue} />}

        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {zoneData && (
          <GeoJSON
            data={zoneData}
            style={getZoneStyle}
            onEachFeature={onEachZone}
          />
        )}

        {/* Venue markers */}
        {Array.isArray(venues) &&
          venues
            .filter((v) => v?.lat && v?.lng)
            .map((venue) => (
              <Marker
                key={venue.id}
                position={[venue.lat, venue.lng]}
                eventHandlers={{
                  click: () => {
                    setUserTriggeredFly(true);
                    onSelectVenue(venue);
                    setRouteKey((prev) => prev + 1);
                  },
                }}
              >
                <Popup>
                  <strong>{venue.name}</strong>
                  <br />
                  {venue.address || "No address provided"}
                </Popup>
              </Marker>
            ))}

        {/* Route between user and selected venue */}
        {userLocation && selectedVenue && (
          <RouteDisplay
            key={routeKey}
            start={[userLocation.lat, userLocation.lng]}
            end={[selectedVenue.lat, selectedVenue.lng]}
          />
        )}
      </MapContainer>
    </Box>
  );
}
