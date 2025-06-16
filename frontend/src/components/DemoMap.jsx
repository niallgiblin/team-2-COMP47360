// Imports from react-leaflet to build the map, with markers, popups, GeoJSON etc
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet'; // Components for rendering the map and it's elements

import { Typography, Button, Box } from '@mui/material'; // Box is a layout component from MUI
import { useEffect, useState } from 'react'; // react hooks for managing component state

import RouteDisplay from './RouteDisplay';


// Main Map component, displays venue markers and polygon zones
export default function DemoMap({ venues = [], selectedVenue, onSelectVenue }) {
  
  // state to hold GeoJSON data for Manhattan zones
  const [zoneData, setZoneData] = useState(null);
  
  // tracks if the zone data has finished loading
  const [zoneDataLoaded, setZoneDataLoaded] = useState(false);

  // tracks if the user has manually selected a venue
  const [userTriggeredFly, setUserTriggeredFly] = useState(false);

  // const [userLocation, setUserLocation] = useState(null);
  const [manualStart, setManualStart] = useState('');



  // load the GeoJSON zone data when component mounts
  useEffect(() => {
    fetch('/manhattanZones.geojson')
      .then(res => res.json())
      .then(data => {
        setZoneData(data);        // save the zone data
        setZoneDataLoaded(true); // mark it as loaded
      })
      .catch(console.error);
  }, []);

  // Define a style for the GeoJSON polygons
  const zoneStyle = {
    fillColor: '#FF4ECD',   //Fill colour
    weight: 2,              // border thickness
    opacity: 1,             // border opacity
    color: '#3ABEFF',       // border colour
    fillOpacity: 0.5,       // interior transparency
  };

  // highlight zone on hover
  const onEachZone = (feature, layer) => {
    layer.on({
      mouseover: (e) => {
        e.target.setStyle({
          weight: 3,
          color: '#fff',
          fillOpacity: 0.7,
        });
      },
      
      // reset to original style when mouse leaves
      mouseout: (e) => {
        e.target.setStyle(zoneStyle);
      },
      
      // on click, display an alert with the zone name
      click: () => {
        alert(`You clicked on zone: ${feature.properties.name || 'Unnamed Area'}`);
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
        venue.latitude && 
        venue.longitude
      ) {
        // small time delay to ensure map is ready
        const timeout = setTimeout(() => {
          map.flyTo([venue.latitude, venue.longitude], 15); // fly to venue at zoom level 15
        }, 300); // delay by 300ms
  
        return () => clearTimeout(timeout); // clean up
      }
    }, [venue, map, zoneDataLoaded, userTriggeredFly]);
  
    return null; // doesn't render anything
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
        console.warn('Could not get user location:', error);
      }
    );
  }, []);

  const handleGeocodeStart = () => {
    if (!manualStart.trim()) return;
  
    const encoded = encodeURIComponent(manualStart.trim());
  
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encoded}`)
      .then(res => res.json())
      .then(results => {
        if (results.length > 0) {
          const firstResult = results[0];
          setUserLocation({
            lat: parseFloat(firstResult.lat),
            lng: parseFloat(firstResult.lon),
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
    // Use MUI's box component as a container
    <Box 
      sx={{ 
        width: '100%', 
        height: '100%', 
        }}>
      
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
            padding: '8px',
            width: '100%',
            maxWidth: '300px',
            borderRadius: '4px',
            border: '1px solid #888'
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
        center={[40.72, -74.00]} // Set initial centre to Manhattan
        zoom={14} // Set initial zoom level
        style={{ height: '100%', width: '100%' }} // Ensure the map takes up the full size of the box container
      >
      {selectedVenue && (
        <FlyToVenue venue={selectedVenue} zoneDataLoaded={zoneDataLoaded} />
        )}

        
        {/* Base map layer from OpenStreetMap */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {/* Render Manhattan zones */}
        {zoneData && (
          <GeoJSON 
            data={zoneData} 
            style={zoneStyle} 
            onEachFeature={onEachZone} 
          />
        )}
        
        {/* Loop through all venues and add markers */}
        {venues.map((venue) => (
          <Marker
            key={venue.id}
            position={[venue.latitude, venue.longitude]} // plot by coordinates
            eventHandlers={{
              click: () => 
                {
                  setUserTriggeredFly(true);
                  onSelectVenue(venue);
                },
            }}
          >
            
            {/* Popup shown on marker click */}
            <Popup>
              <strong>{venue.name}</strong>
              <br />
              {venue.address || 'No address provided'}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </Box>
  );
}
