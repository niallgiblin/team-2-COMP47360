import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  useMap,
  Tooltip
} from 'react-leaflet';

import {
  Typography,
  Button,
  Box,
  TextField
} from '@mui/material';

import { useEffect, useState, useRef } from 'react';
import RouteDisplay from './RouteDisplay';
import L from 'leaflet';

// Fix for default marker icons
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

export default function DemoMap({ venues = [], selectedVenue, onSelectVenue }) {
  const [zoneData, setZoneData] = useState(null);
  const [busynessData, setBusynessData] = useState([]);
  const [zoneDataLoaded, setZoneDataLoaded] = useState(false);
  const [userTriggeredFly, setUserTriggeredFly] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [manualStart, setManualStart] = useState('');
  const [routeKey, setRouteKey] = useState(0);

  const getColorForBusyness = (busyness) => {
    if (busyness >= 75) return '#FF0000';
    if (busyness >= 50) return '#FFA500';
    if (busyness >= 25) return '#FFFF00';
    return '#00FF00';
  };

  const getZoneStyle = (feature) => {
    const locationId = feature.properties.LocationID;
    const match = busynessData.find((z) => z.LocationID === locationId);
    const fillColor = match ? getColorForBusyness(match.busyness * 100) : '#CCCCCC';
    return {
      fillColor,
      weight: 2,
      opacity: 1,
      color: '#3ABEFF',
      fillOpacity: 0.5
    };
  };

  useEffect(() => {
    fetch('/manhattanZones.geojson')
        .then((res) => res.json())
        .then((data) => {
          setZoneData(data);
          setZoneDataLoaded(true);
        })
        .catch(console.error);
  }, []);

  useEffect(() => {
    fetch('/api/zones/busyness')
        .then((res) => res.json())
        .then((data) => setBusynessData(data))
        .catch(console.error);
  }, []);

  const onEachZone = (feature, layer) => {
    layer.on({
      mouseover: (e) => {
        e.target.setStyle({
          weight: 3,
          color: '#ffffff',
          fillOpacity: 0.7
        });
      },
      mouseout: (e) => {
        const originalStyle = getZoneStyle(feature);
        e.target.setStyle(originalStyle);
      },
      click: () => {
        alert(
            `You clicked on zone: ${feature.properties.zone || feature.properties.name || 'Unnamed Area'}`
        );
      }
    });

    const match = busynessData.find(
        (z) => z.LocationID === feature.properties.LocationID
    );
    const level = match ? `${(match.busyness * 100).toFixed(0)}% busy` : 'No data';

    layer.bindTooltip(
        `${feature.properties.zone || feature.properties.name || 'Unnamed Zone'} — ${level}`,
        { sticky: true }
    );
  };

  function FlyToVenue({ venue }) {
    const map = useMap();
    useEffect(() => {
      if (
          userTriggeredFly &&
          zoneDataLoaded &&
          venue &&
          typeof venue.lat === 'number' &&
          typeof venue.lng === 'number'
      ) {
        const timeout = setTimeout(() => {
          map.flyTo([venue.lat, venue.lng], 15);
        }, 300);
        return () => clearTimeout(timeout);
      }
    }, [venue, map]);
    return null;
  }

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.warn('Could not get user location:', error);
        }
    );
  }, []);

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
              lng: parseFloat(firstResult.lon)
            });
          } else {
            alert('Address not found. Try being more specific.');
          }
        })
        .catch((err) => {
          console.error('Geocoding error:', err);
          alert('Failed to find location.');
        });
  };

  return (
      <Box sx={{ width: '100%', height: '100%' }}>
        <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              alignItems: 'center',
              mb: 2
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
                '& .MuiInputBase-input': {
                  color: 'white'  // input text
                },
                '& .MuiInputLabel-root': {
                  color: 'white'  // label text
                },
                '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'white'  // border
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#ccc'  // hover border color
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#3ABEFF'  // focused border color
                }
              }}
              InputLabelProps={{
                shrink: true
              }}
          />
          <Button variant="contained" onClick={handleGeocodeStart}>
            Set Start
          </Button>
        </Box>

        <MapContainer
            center={[40.72, -74.0]}
            zoom={14}
            style={{ height: '80vh', width: '100%', borderRadius: 12 }}
        >
          {selectedVenue && <FlyToVenue venue={selectedVenue} />}

          <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
          />

          {userLocation && (
              <Marker position={[userLocation.lat, userLocation.lng]}>
                <Tooltip direction="top" offset={[0, -10]} permanent>
                  You are here
                </Tooltip>
              </Marker>
          )}

          {zoneData && (
              <GeoJSON
                  data={zoneData}
                  style={getZoneStyle}
                  onEachFeature={onEachZone}
              />
          )}

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
                            }
                          }}
                      >
                        <Popup>
                          <strong>{venue.name || 'Unnamed Venue'}</strong>
                          <br />
                          {venue.address || 'No address provided'}
                        </Popup>
                      </Marker>
                  ))}

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