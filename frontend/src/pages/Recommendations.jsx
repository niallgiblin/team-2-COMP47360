import { useState, useEffect } from 'react';
import PageWrapper from '../components/PageWrapper';
import { Typography, Box } from '@mui/material';
import TrendingVenueCard from '../components/TrendingVenueCard';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Turf imports
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";

export default function Recommendations() {
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);
  const [busynessMap, setBusynessMap] = useState([]);
  const [zoneData, setZoneData] = useState(null);

  const navigate = useNavigate();
  const { makeAuthenticatedRequest } = useAuth();

  const handleGetDirections = (venue) => {
    navigate('/map', { state: { selectedVenue: venue } });
  };

  // 1. Fetch Manhattan GeoJSON
  useEffect(() => {
    fetch('/manhattanZones.geojson')
      .then((res) => res.json())
      .then(setZoneData)
      .catch(err => console.error('Failed to load zone data:', err));
  }, []);

  // 2. Fetch busyness map data
  useEffect(() => {
    fetch('http://localhost:8080/vibe/map-data')
      .then((res) => res.json())
      .then((data) => {
        setBusynessMap(data.busyness || {});
      })
      .catch((err) => {
        console.error("Failed to fetch busyness map-data:", err);
        setBusynessMap({});
      });
  }, []);

  // 3. Fetch venue data and enrich with zone ID
  useEffect(() => {
    makeAuthenticatedRequest('http://localhost:8080/api/location/trending')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch venue data');
        return res.json();
      })
      .then((data) => {
        const venues = data.locations || data;

        const transformed = venues.map((venue) => {
          const enriched = {
            ...venue,
            id: venue.id || venue.placeId,
            latitude: venue.latitude || venue.lat,
            longitude: venue.longitude || venue.lng,
            address: venue.address || 'No address provided',
            zone: venue.zone || venue.Zone || 'Unknown',
          };

          if (zoneData && enriched.latitude && enriched.longitude) {
            const venuePoint = turfPoint([enriched.longitude, enriched.latitude]);
            const matchingZone = zoneData.features.find((feature) =>
              booleanPointInPolygon(venuePoint, feature.geometry)
            );
            if (matchingZone) {
              enriched.zoneId = matchingZone.properties.LocationID;
            }
          }

          return enriched;
        });
        console.log("First enriched venue in Recommendations:", transformed[0]);
        setVenues(transformed);
        setLoading(false);
      })
      
      .catch(async (err) => {
        console.warn('Falling back to mock data due to error:', err);

        try {
          const res = await fetch('/mock/venues.json');
          const mockData = await res.json();

          const transformed = mockData.map((v) => ({
            ...v,
            latitude: v.lat,
            longitude: v.lng,
            address: v.address || 'No address provided',
          }));

          setVenues(transformed);
          setIsMock(true);
        } catch (mockErr) {
          console.error('Error loading mock data:', mockErr);
        }

        setLoading(false);
      });
  }, [zoneData]); //wait for zoneData

  if (loading) {
    return (
      <PageWrapper>
        <Typography sx={{ color: 'white', p: 4 }}>
          Loading trending venues...
        </Typography>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <Box sx={{ maxWidth: 700, mx: 'auto', mt: 0, mb: 10, px: 2 }}>
        <Typography variant="h4" sx={{ color: '#fff', mb: 2, textAlign: 'center' }}>
          What’s Hot Tonight
        </Typography>

        <Typography variant="body2" sx={{ color: '#aaa', mb: 3, textAlign: 'center' }}>
          See the top trending venues based on footfall, reviews, and vibe activity.
        </Typography>

        {isMock && (
          <Typography variant="body2" sx={{ color: 'orange', mb: 2, textAlign: 'center' }}>
            (Mock data displayed — backend unavailable)
          </Typography>
        )}

        {venues.map((venue, index) => (
          <TrendingVenueCard
            key={venue.id || index}
            venue={venue}
            busynessMap={busynessMap}
            rank={index + 1}
            onGetDirections={handleGetDirections}
          />
        ))}
      </Box>
    </PageWrapper>
  );
}
