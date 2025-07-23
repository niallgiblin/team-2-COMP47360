import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid } from '@mui/material';
import TrendingVenueCard from './TrendingVenueCard'; 
import { useLike } from '../context/LikeContext'; 
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";

function FavouriteVenues() {
    const { likedVenues } = useLike();
    const [busynessMap, setBusynessMap] = useState({});
    const [zoneData, setZoneData] = useState(null);
    const [enrichedVenues, setEnrichedVenues] = useState([]);
    const [allVenues, setAllVenues] = useState([]);

    // Fetch busyness data for the busyness chip
    useEffect(() => {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
        fetch(`${API_BASE_URL}/vibe/map-data`)
            .then((res) => res.json())
            .then((data) => {
                setBusynessMap(data.busyness || {});
                setAllVenues(data.locations || []);
            })
            .catch((err) => console.error("Failed to fetch busyness data:", err));
    }, []);

    // Fetch zone data for geo-lookups
    useEffect(() => {
        fetch("/manhattanZones.geojson")
            .then((res) => res.json())
            .then((data) => setZoneData(data))
            .catch((err) => console.error("Failed to load zone data:", err));
    }, []);

    // Enrich liked venues with zoneId and full data once zoneData and allVenues are available
    useEffect(() => {
        if (!zoneData || likedVenues.length === 0) {
            setEnrichedVenues(likedVenues);
            return;
        }
        // Merge with allVenues for full data
        const merged = likedVenues.map(liked => {
            // Try to find a match by id, then placeId, then lat/lng
            let full = allVenues.find(v => v.id === liked.id || v.placeId === liked.id || v.id === liked.placeId || v.placeId === liked.placeId);
            if (!full && liked.latitude && liked.longitude) {
                full = allVenues.find(v => v.latitude === liked.latitude && v.longitude === liked.longitude);
            }
            let enriched = { ...full, ...liked };
            // Always ensure a canonical id
            enriched.id = enriched.id || enriched.placeId || (full && (full.id || full.placeId)) || (liked && (liked.id || liked.placeId));
            if (!enriched.zoneId && enriched.latitude && enriched.longitude) {
                const venuePoint = turfPoint([enriched.longitude, enriched.latitude]);
                const matchingZone = zoneData.features.find(feature => booleanPointInPolygon(venuePoint, feature.geometry));
                enriched.zoneId = matchingZone ? matchingZone.properties.LocationID : undefined;
            }
            // Improved tag extraction logic
            if (!enriched.tags || enriched.tags.length === 0) {
                let tags = [];
                if (enriched.tags && Array.isArray(enriched.tags) && enriched.tags.length > 0) {
                    tags = enriched.tags;
                    } else if (enriched.type) {
                        tags = enriched.type.split(',').map(t => t.trim()).filter(Boolean);
                } else if (enriched.description) {
                    tags = enriched.description.split(/[ ,]+/).map(t => t.trim()).filter(Boolean);
                    }
                // Fallback: use the venue category as a tag
                if (tags.length === 0 && enriched.category) {
                    tags = [enriched.category];
                }
                enriched.tags = tags;
            }
            return enriched;
        });
        setEnrichedVenues(merged);
    }, [likedVenues, zoneData, allVenues]);

    // Defensive: filter out invalid venues
    const filteredVenues = enrichedVenues.filter(
      v => v && typeof v === 'object' && v.id && v.name
    );

    return (
        <Box sx={{ width: '100%' }}>
            {/* Title outside the border */}
            <Typography variant="h5" gutterBottom sx={{ color: '#fff', mb: 2 }}>
                Your Favorite Venues
            </Typography>

            {/* Bordered container */}
            <Box
                sx={{
                    border: '1px solid #ff00cc',
                    borderRadius: '16px',
                    padding: 3,
                    backgroundColor: '#000',
                    color: '#fff',
                }}
            >
                {filteredVenues.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                        You haven’t liked any venues yet.
                    </Typography>
                ) : (
                    <Grid container spacing={2}>
                        {filteredVenues.map((venue) => (
                            <Grid item xs={12} sm={6} md={4} key={venue.id}>
                                <TrendingVenueCard 
                                    venue={venue} 
                                    busynessMap={busynessMap} 
                                    showLikeButton={true} 
                                    unlikeOnlyFromFavorites={true} 
                                    tags={venue.tags}
                                    hidePlanButtons={true}
                                />
                            </Grid>
                        ))}
                    </Grid>
                )}
            </Box>
        </Box>
    );
}

export default FavouriteVenues;