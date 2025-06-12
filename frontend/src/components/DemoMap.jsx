import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet'; // Components for rendering the map and it's elements
import { Box } from '@mui/material'; // Box is a layout component from MUI
import { useEffect, useState } from 'react';

// Main Map component, displays venue markers and polygon zones
export default function DemoMap({ venues = [], onSelectVenue }) {
  
  // state to hold GeoJSON data for Manhattan zones
  const [zoneData, setZoneData] = useState(null);

  // load the GeoJSON zone data when component mounts
  useEffect(() => {
    fetch('/data/manhattanZones.geojson')
      .then(res => res.json())
      .then(setZoneData)
      .catch(console.error);
  }, []);

  // Define a style for the polygons
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

  return (
    // Use MUI's box component as a containere
    <Box 
      sx={{ 
        width: '100%', 
        height: '100%', 
        }}>
      
      {/* Initialise the map container */}
      <MapContainer
        center={[40.72, -74.00]} // Set initial centre to Manhattan
        zoom={14} // Set initial zoom level
        style={{ height: '100%', width: '100%' }} // Ensure the map takes up the full size of the box container
      >
        
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
              click: () => onSelectVenue(venue),
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
