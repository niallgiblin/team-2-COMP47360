import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Box } from '@mui/material';

export default function DemoMap() {
  return (
    <Box sx={{ width: '100%', height: '500px', my: 4 }}>
      <MapContainer
        center={[40.7128, -74.006]} // Manhattan
        zoom={13}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <Marker position={[40.7128, -74.006]}>
          <Popup>You're in Manhattan!</Popup>
        </Marker>
      </MapContainer>
    </Box>
  );
}
