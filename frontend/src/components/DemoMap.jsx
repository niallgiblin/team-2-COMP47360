import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'; // Components for rendering the map and it's elements
import { Box } from '@mui/material'; // Box is a layout component from MUI

// Define the DemoMap component
export default function DemoMap() {
  return (
    // Use MUI's box component as a containere
    <Box 
      sx={{ 
        width: '100%', 
        height: '100%', 
        }}>
      
      {/* Initialise the map container */}
      <MapContainer
        center={[40.7128, -74.006]} // Set initial centre to Manhattan
        zoom={13} // Set initial zoom level
        style={{ height: '100%', width: '100%' }} // Ensure the map takes up the full size of the box container
      >
        
        {/* Load and display tiles from OpenStreetMap */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        
        {/* Add a marker at the some location as the map centre */}
        <Marker position={[40.7128, -74.006]}>
          {/* Show a popup when the marker is clicked */}
          <Popup>You're in Manhattan!</Popup>
        </Marker>
      </MapContainer>
    </Box>
  );
}
