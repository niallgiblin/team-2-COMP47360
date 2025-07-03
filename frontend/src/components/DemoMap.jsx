import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  useMap,
  Tooltip,
  Polyline
} from 'react-leaflet';

import { Box } from '@mui/material';
import { useEffect, useState, useRef } from 'react';
import RouteDisplay from './RouteDisplay';
import L from 'leaflet';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

export default function DemoMap({
  venues = [],
  selectedVenue,
  onSelectVenue,
  fromPlan = false,
  userLocation,
  showDirections = false,
  plan = [],
  routeCoords = []
}) {
  const [zoneData, setZoneData] = useState(null);
  const [busynessData, setBusynessData] = useState([]);
  const [zoneDataLoaded, setZoneDataLoaded] = useState(false);
  const [userTriggeredFly, setUserTriggeredFly] = useState(false);
  const [routeKey, setRouteKey] = useState(0);
  const [zoneCenter, setZoneCenter] = useState(null);

  const [predictionData, setPredictionData] = useState([]);
  const [selectedTimestamp, setSelectedTimestamp] = useState(null);

  const [mode] = useState('forecast');
  const [activeZoneVenues, setActiveZoneVenues] = useState([]);

  const allVenuesRef = useRef([]);

  const getColorForBusyness = (busyness) => {
    if (busyness >= 75) return '#FF0000';
    if (busyness >= 50) return '#FFA500';
    if (busyness >= 25) return '#FFFF00';
    return '#00FF00';
  };

  const getZoneStyle = (feature) => {
    const locationId = feature.properties.LocationID;
    if (mode === 'forecast') {
      const zone = predictionData.find(z => z.LocationID === locationId);
      const match = zone?.predictions?.find(p => p.timestamp === selectedTimestamp);
      const fillColor = match ? getColorForBusyness(match.busyness * 100) : '#CCCCCC';
      return {
        fillColor,
        weight: 2,
        opacity: 1,
        color: '#3ABEFF',
        fillOpacity: 0.5
      };
    }
    const match = busynessData.find(z => z.LocationID === locationId);
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
    const fetchZoneData = async () => {
      try {
        const response = await fetch('/manhattanZones.geojson');
        if (!response.ok) {
          // This will happen on a 404 Not Found error, for example.
          throw new Error(`Failed to fetch zone data: ${response.status} ${response.statusText}`);
        }
        const json = await response.json(); // Use .json() directly for robust parsing
        setZoneData(json);
        setZoneDataLoaded(true);
      } catch (err) {
        console.error('Error loading GeoJSON:', err);
      }
    };
    fetchZoneData();
  }, []);

  useEffect(() => {
    const fetchBusyness = async () => {
      try {
        const response = await fetch('http://localhost:8080/api/zones/busyness');
        if (!response.ok) {
          // This check prevents trying to parse a non-JSON response (like an HTML error page)
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setBusynessData(data);
      } catch (error) {
        console.error("Could not fetch busyness data. Zones may not be colored correctly.", error);
      }
    };

    fetchBusyness();
  }, []);

  useEffect(() => {
    // This effect now uses venues instead of re-fetching
    if (!zoneData || venues.length === 0) return;

    const enrichedVenues = venues.map((venue) => {
      if (typeof venue.lat !== 'number' || typeof venue.lng !== 'number') return venue;
      const venuePoint = turfPoint([venue.lng, venue.lat]);
      // Use .find()
      const matchingZone = zoneData.features.find((feature) =>
        booleanPointInPolygon(venuePoint, feature.geometry)
      );
      return { ...venue, zone: matchingZone ? matchingZone.properties.LocationID : null };
    });
    allVenuesRef.current = enrichedVenues;
  }, [zoneData, venues]);

  useEffect(() => {
    const dummy = [
      {
        LocationID: 'zone_001',
        predictions: [
          { timestamp: '2025-06-23T18:00:00Z', busyness: 0.1 },
          { timestamp: '2025-06-23T19:00:00Z', busyness: 0.3 },
          { timestamp: '2025-06-23T20:00:00Z', busyness: 0.5 },
          { timestamp: '2025-06-23T21:00:00Z', busyness: 0.75 },
          { timestamp: '2025-06-23T22:00:00Z', busyness: 0.9 },
        ],
      }
    ];
    setPredictionData(dummy);
    setSelectedTimestamp(dummy[0].predictions[0].timestamp);
  }, []);


  const handleZoneClick = (feature) => {
    const zoneId = feature.properties.LocationID;
    try {
      const data = allVenuesRef.current.filter(
        v => String(v.zone) === String(zoneId)
      );
      setActiveZoneVenues(data);
    } catch (err) {
      console.error('Failed to load venues for zone:', err);
      setActiveZoneVenues([]);
    }
  };

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
      click: async (e) => {
        const bounds = e.target.getBounds();
        const center = bounds.getCenter();
        setZoneCenter(center);
        handleZoneClick(feature);
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

  function FlyToZone({ center }) {
    const map = useMap();
    useEffect(() => {
      if (center) {
        map.flyTo([center.lat, center.lng], 15);
      }
    }, [center]);
    return null;
  }

  function ChoroplethLegend() {
    const map = useMap();
    useEffect(() => {
      const styleTagId = 'leaflet-legend-style';
      if (!document.getElementById(styleTagId)) {
        const style = document.createElement('style');
        style.id = styleTagId;
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

      const legend = L.control({ position: 'bottomright' });

      legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'leaflet-control legend');
        const levels = [
          { label: 'Quiet', color: getColorForBusyness(1) },
          { label: 'Moderate', color: getColorForBusyness(26) },
          { label: 'Busy', color: getColorForBusyness(51) },
          { label: 'Very busy', color: getColorForBusyness(76) },
        ];
        div.innerHTML = levels
          .map(level => `<i style="background:${level.color}"></i> ${level.label}`)
          .join('<br>');
        return div;
      };

      legend.addTo(map);
      return () => legend.remove();
    }, [map]);

    return null;
  }

  function FlyToPlan({ venues, fromPlan }) {
    const map = useMap();
  
    useEffect(() => {
      if (!fromPlan || !venues || venues.length === 0) return;
  
      // Extract lat/lng pairs
      const coords = venues
        .filter(v => typeof v.lat === 'number' && typeof v.lng === 'number')
        .map(v => [v.lat, v.lng]);
  
      if (coords.length === 1) {
        map.flyTo(coords[0], 15); // zoom 15 for a single venue
      } else {
        // Compute the center of all venues
        const latSum = coords.reduce((sum, [lat]) => sum + lat, 0);
        const lngSum = coords.reduce((sum, [, lng]) => sum + lng, 0);
        const center = [latSum / coords.length, lngSum / coords.length];
  
        map.flyTo(center, 14); // zoom out a little for multiple venues
      }
    }, [venues, fromPlan, map]);
  
    return null;
  }

  function FlyToUserLocation({ location }) {
    const map = useMap();
  
    useEffect(() => {
      if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
        map.flyTo([location.lat, location.lng], 15);
      }
    }, [location, map]);
  
    return null;
  }
  

  return (
    <Box 
      sx={{ 
        width: '100%', 
        height: '100%' 
      }}
    >
      <MapContainer
        center={[40.72, -73.95]}
        zoom={12}
        scrollWheelZoom={false}
        whenCreated={(map) => {
          map.on('click', () => map.scrollWheelZoom.enable());
        }}
        style={{ height: 'calc(120vh - 300px)', width: '100%' }}
      >
        {/* Auto fly to userLocation if set manually */}
        <FlyToUserLocation location={userLocation} />
        
        {/* Fly to appropriate center if fromPlan */}
        <FlyToPlan venues={plan} fromPlan={fromPlan} />
        
        {selectedVenue && <FlyToVenue venue={selectedVenue} />}
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
            data={zoneData}
            style={getZoneStyle}
            onEachFeature={onEachZone}
          />
        )}
        {(fromPlan ? venues : activeZoneVenues)
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
        
        {showDirections && routeCoords.length > 0 && (
          <Polyline
            positions={routeCoords}
            color="#3ABEFF"
            weight={4}
          />
        )}

      </MapContainer>
    </Box>
  );
}
