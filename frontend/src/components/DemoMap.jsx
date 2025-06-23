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

import { useEffect, useState } from 'react';
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

// Main map component
export default function DemoMap({ venues = [], selectedVenue, onSelectVenue }) {
  const [zoneData, setZoneData] = useState(null); // Stores GeoJSON zone features
  const [busynessData, setBusynessData] = useState([]); // stores real-time busyness, by zone
  const [zoneDataLoaded, setZoneDataLoaded] = useState(false); // whether zones are fully loaded
  const [userTriggeredFly, setUserTriggeredFly] = useState(false); // track whether a user clicked a venue
  const [userLocation, setUserLocation] = useState(null); // store user's detected or typed location
  const [manualStart, setManualStart] = useState(''); // user input for manual start address
  const [routeKey, setRouteKey] = useState(0); 
  const [zoneCenter, setZoneCenter] = useState(null); // holds clicked zone's center


  // colour zones by busyness
  const getColorForBusyness = (busyness) => {
    if (busyness >= 75) return '#FF0000'; // red - very busy
    if (busyness >= 50) return '#FFA500'; // orange - moderately busy
    if (busyness >= 25) return '#FFFF00'; // yellow - less busy
    return '#00FF00'; // green - quiet
  };

  const getZoneStyle = (feature) => {
    const locationId = feature.properties.LocationID;
    const match = busynessData.find((z) => z.LocationID === locationId);
    const fillColor = match ? getColorForBusyness(match.busyness * 100) : '#CCCCCC'; // default grey
    return {
      fillColor,
      weight: 2,
      opacity: 1,
      color: '#3ABEFF', // blue border
      fillOpacity: 0.5
    };
  };

  // load GeoJSON zone shapes
  useEffect(() => {
    fetch('/manhattanZones.geojson')
        .then((res) => res.json())
        .then((data) => {
          setZoneData(data);
          setZoneDataLoaded(true);
        })
        .catch(console.error);
  }, []);

  // fetch busyness levels
  useEffect(() => {
    fetch('/api/zones/busyness')
        .then((res) => res.json())
        .then((data) => setBusynessData(data))
        .catch(console.error);
  }, []);

  const onEachZone = (feature, layer) => {
    // set up mouse interaction
    layer.on({
      mouseover: (e) => {
        e.target.setStyle({
          weight: 3,            // thicker border on hover
          color: '#ffffff',     // white border on hover
          fillOpacity: 0.7      // slightly more opaque on hover
        });
      },
      mouseout: (e) => {
        // restore original style when mouse leaves
        const originalStyle = getZoneStyle(feature);
        e.target.setStyle(originalStyle);
      },
      click: (e) => {
        const bounds = e.target.getBounds(); // get coordinated of the clicked polygon
        const center = bounds.getCenter(); // calculate center of zone
        setZoneCenter(center);             // store it in state
      }      
    });

    // find the corresponding busyness data for the zone
    const match = busynessData.find(
        (z) => z.LocationID === feature.properties.LocationID
    );
    const level = match ? `${(match.busyness * 100).toFixed(0)}% busy` : 'No data';

    // add tooltip to each zone with name and busyness level
    layer.bindTooltip(
        `${feature.properties.zone || feature.properties.name || 'Unnamed Zone'} — ${level}`,
        { sticky: true } // tooltip stays near curser
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
          // animate the map to zoom into the selected venue
          map.flyTo([venue.lat, venue.lng], 15);
        }, 300); // time delay to avoid errors
        return () => clearTimeout(timeout);
      }
    }, [venue, map]); // re-run if venue or map instance changes
    return null;
  }

  function FlyToZone({ center }) {
    const map = useMap();
  
    useEffect(() => {
      if (center) {
        map.flyTo([center.lat, center.lng], 15); // zoom to zone
      }
    }, [center]); //re-run when centre updates
  
    return null;
  }
  

  // get user's current location
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

  // convert manual start address into coordinates
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
            center={[40.72, -73.95]}
            zoom={12}
            style={{ height: '80vh', width: '100%', borderRadius: 12 }}
        >
          {selectedVenue && <FlyToVenue venue={selectedVenue} />}

          <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
          />

          {zoneCenter && <FlyToZone center={zoneCenter} />}


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