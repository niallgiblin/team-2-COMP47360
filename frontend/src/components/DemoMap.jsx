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
  TextField,
  Slider
} from '@mui/material';

import { useEffect, useState, useRef } from 'react';
import RouteDisplay from './RouteDisplay';
import L from 'leaflet';

// Fix for default marker icons
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

// Main map component
export default function DemoMap({ venues = [], selectedVenue, onSelectVenue, fromPlan = false }) {
  const [zoneData, setZoneData] = useState(null); // Stores GeoJSON zone features
  const [busynessData, setBusynessData] = useState([]); // stores real-time busyness, by zone
  const [zoneDataLoaded, setZoneDataLoaded] = useState(false); // whether zones are fully loaded
  const [userTriggeredFly, setUserTriggeredFly] = useState(false); // track whether a user clicked a venue
  const [userLocation, setUserLocation] = useState(null); // store user's detected or typed location
  const [manualStart, setManualStart] = useState(''); // user input for manual start address
  const [routeKey, setRouteKey] = useState(0); 
  const [zoneCenter, setZoneCenter] = useState(null); // holds clicked zone's center

  // set up state for prediction dat and time control
  const [predictionData, setPredictionData] = useState([]);       // holds full prediction dataset
  const [selectedTimestamp, setSelectedTimestamp] = useState(null); // current time on slider
  
  // Extract available timestamps from the first zone's prediction list
  const availableTimestamps = predictionData[0]?.predictions?.map(p => p.timestamp) || [];

  // state to track the current mode (live or predicted)
  const [mode, setMode] = useState('forecast'); // or 'live'

  const [activeZoneVenues, setActiveZoneVenues] = useState([]);

  const allVenuesRef = useRef([]);


  // colour zones by busyness
  const getColorForBusyness = (busyness) => {
    if (busyness >= 75) return '#FF0000'; // red - very busy
    if (busyness >= 50) return '#FFA500'; // orange - moderately busy
    if (busyness >= 25) return '#FFFF00'; // yellow - less busy
    return '#00FF00'; // green - quiet
  };

  // assign style to zones based on selected mode (live or forecast)
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
  
    // fallback to live data
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
  
  // load GeoJSON zone shapes
  useEffect(() => {
    fetch('/manhattanZones.geojson')
      .then(async (res) => {
        const text = await res.text(); // read the full response as raw text
        console.log('📦 FULL raw response:', text); // log it
        const json = JSON.parse(text); // try to parse it as JSON
        setZoneData(json);
        setZoneDataLoaded(true);
      })
      .catch((err) => {
        console.error('❌ Failed to load or parse GeoJSON:', err.message);
      });
  }, []);
  

  // fetch busyness levels
  useEffect(() => {
    fetch('/api/zones/busyness')
        .then((res) => res.json())
        .then((data) => setBusynessData(data))
        .catch(console.error);
  }, []);

  // fetch all venues
  useEffect(() => {
    if (!zoneData) return;
  
    fetch('http://localhost:8080/api/location')
      .then((res) => res.json())
      .then((data) => {
        const enriched = data.map((venue) => {
          const venuePoint = turfPoint([venue.lng, venue.lat]);
  
          const match = zoneData.features.filter((feature) =>
            booleanPointInPolygon(venuePoint, feature.geometry)
          );
  
          console.log("🧪 Venue matches these zones:", match.map(f => f.properties.LocationID));
  
          return {
            ...venue,
            zone: match.length > 0 ? match[0].properties.LocationID : null
          };
        });
  
        console.log("🧩 Sample enriched venue:", enriched[0]);
        console.log("🧩 All enriched venue zone values:", enriched.map(v => v.zone));
  
        allVenuesRef.current = enriched; // ✅ Store latest venue list in ref
      })
      .catch((err) => console.error('❌ Failed to preload all venues:', err));
  }, [zoneData]);
  
  

// TEMPORARY: use dummy prediction data until backend is ready
useEffect(() => {
  // const fetchPredictionData = async () => {
  //   try {
  //     const res = await fetch('/cached/predictions.json');
  //     const data = await res.json();
  //     setPredictionData(data);
  //     if (data.length > 0 && data[0].predictions?.length > 0) {
  //       setSelectedTimestamp(data[0].predictions[0].timestamp);
  //     }
  //   } catch (err) {
  //     console.error('Failed to load prediction data:', err);
  //   }
  // };
  // fetchPredictionData();

  // Load dummy data for testing
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
    },
    {
      LocationID: 'zone_002',
      predictions: [
        { timestamp: '2025-06-23T18:00:00Z', busyness: 0.2 },
        { timestamp: '2025-06-23T19:00:00Z', busyness: 0.4 },
        { timestamp: '2025-06-23T20:00:00Z', busyness: 0.6 },
        { timestamp: '2025-06-23T21:00:00Z', busyness: 0.8 },
        { timestamp: '2025-06-23T22:00:00Z', busyness: 1.0 },
      ],
    },
  ];

  setPredictionData(dummy);
  setSelectedTimestamp(dummy[0].predictions[0].timestamp);
}, []);

  // Map behaviour - FIXED: Single click handler that uses the ref
  const handleZoneClick = (feature) => {
    const zoneId = feature.properties.LocationID;
  
    console.log('🧭 Clicked zone ID:', zoneId);
    console.log('📦 All venue zone IDs:', allVenuesRef.current.map(v => v.zone));
    console.log('📛 ZoneId type:', typeof zoneId);
  
    try {
      const data = allVenuesRef.current.filter(
        v => String(v.zone) === String(zoneId)
      );
      console.log('✅ Filtered venues:', data);
      setActiveZoneVenues(data);
    } catch (err) {
      console.error('❌ Failed to load venues for zone:', err);
      setActiveZoneVenues([]);
    }
  };
  
  
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
      click: async (e) => {
        const bounds = e.target.getBounds();
        const center = bounds.getCenter();
        setZoneCenter(center);
        
        // FIXED: Use the single handleZoneClick function
        handleZoneClick(feature);
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

  // zoom into selected venue
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

  // zoom into clicked zone
  function FlyToZone({ center }) {
    const map = useMap();
  
    useEffect(() => {
      if (center) {
        map.flyTo([center.lat, center.lng], 15); // zoom to zone
      }
    }, [center]); //re-run when centre updates
  
    return null;
  }
  
  // legend to interpret busyness colours
  function ChoroplethLegend() {
    const map = useMap();
  
    useEffect(() => {
      // custom CSS for the legend
      const styleTagId = 'leaflet-legend-style';
      if (!document.getElementById(styleTagId)) {
        const style = document.createElement('style');
        style.id = styleTagId;
        
        // legend styling
        style.innerHTML = `
        .leaflet-control.legend {
          background: #1e1e1e; /* dark background */
          padding: 12px;
          font-size: 13px;
          line-height: 20px;
          border-radius: 8px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.4);
          color: rgba(255, 255, 255, 0.87); /* text colour */
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
  
      // create and attach legend control
      const legend = L.control({ position: 'bottomright' });
  
      legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'leaflet-control legend');
        const levels = [
          { label: 'Quiet', color: getColorForBusyness(1) },
          { label: 'Moderate', color: getColorForBusyness(26) },
          { label: 'Busy', color: getColorForBusyness(51) },
          { label: 'Very busy', color: getColorForBusyness(76) },
        ];
        
        const labels = levels.map(
          (level) => `<i style="background:${level.color}"></i> ${level.label}`
        );
        
        div.innerHTML = labels.join('<br>');
        
  
        div.innerHTML = labels.join('<br>');
        return div;
      };
  
      legend.addTo(map);
  
      return () => {
        legend.remove();
      };
    }, [map]);
  
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

  // Map page UI
  return (
      <Box 
        sx={{ 
          width: '100%', 
          height: '100%' 
        }}
      >
        

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
          <Button
            onClick={handleGeocodeStart}
            sx={{
              fontWeight: 'bold',
              textTransform: 'uppercase',
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
              color: '#000',
              px: 3,
              py: 1,
              borderRadius: '8px',
              '&:hover': {
                background: 'linear-gradient(to right, #FF4ECD, #3ABEFF)',
              },
            }}
          >
            Set Start
          </Button>

        </Box>

        <MapContainer
            center={[40.72, -73.95]}
            zoom={12}
            style={{ height: 'calc(120vh - 300px)', width: '100%', borderRadius: 12 }}
        >
          {selectedVenue && <FlyToVenue venue={selectedVenue} />}

          <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
          />

          <ChoroplethLegend />


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
        </MapContainer>
      </Box>
  );
}