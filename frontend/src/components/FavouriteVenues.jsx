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
        fetch("http://localhost:8080/api/vibe/map-data")
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
            const full = allVenues.find(v => v.id === liked.id);
            let enriched = { ...full, ...liked };
            if (!enriched.zoneId && enriched.latitude && enriched.longitude) {
                const venuePoint = turfPoint([enriched.longitude, enriched.latitude]);
                const matchingZone = zoneData.features.find(feature => booleanPointInPolygon(venuePoint, feature.geometry));
                enriched.zoneId = matchingZone ? matchingZone.properties.LocationID : undefined;
            }
            // Add tags if missing
            if (!enriched.tags || enriched.tags.length === 0) {
                let tags = [];
                if (enriched.tags && Array.isArray(enriched.tags)) {
                    tags = enriched.tags;
                } else {
                    if (enriched.description) {
                        tags = enriched.description.split(',').map(t => t.trim()).filter(Boolean);
                    } else if (enriched.type) {
                        tags = enriched.type.split(',').map(t => t.trim()).filter(Boolean);
                    }
                }
                enriched.tags = tags;
            }
            return enriched;
        });
        setEnrichedVenues(merged);
    }, [likedVenues, zoneData, allVenues]);

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
                {enrichedVenues.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                        You haven’t liked any venues yet.
                    </Typography>
                ) : (
                    <Grid container spacing={2}>
                        {enrichedVenues.map((venue) => (
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