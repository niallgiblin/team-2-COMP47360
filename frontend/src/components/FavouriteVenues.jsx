import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid } from '@mui/material';
import TrendingVenueCard from './TrendingVenueCard'; 
import { useLike } from '../context/LikeContext'; 
import { useBusyness } from '../context/BusynessContext';
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";

function FavouriteVenues() {
    const { likedVenues } = useLike();
    const { busynessData: contextBusynessData, fetchBusynessData } = useBusyness();
    const [busynessMap, setBusynessMap] = useState({});
    const [zoneData, setZoneData] = useState(null);
    const [enrichedVenues, setEnrichedVenues] = useState([]);
    const [allVenues, setAllVenues] = useState([]);

    // Handle context data updates separately
    useEffect(() => {
        if (contextBusynessData && contextBusynessData.length > 0) {
            const busynessMapFromContext = {};
            contextBusynessData.forEach(item => {
                const zoneId = String(item.LocationID).replace(" NET", "");
                busynessMapFromContext[zoneId] = item.busyness;
            });
            setBusynessMap(busynessMapFromContext);
        }
    }, [contextBusynessData]);

    // Fetch busyness data for the busyness chip
    useEffect(() => {
        const loadData = async () => {
            try {
                await fetchBusynessData();
                // Also fetch venues data for enrichment
                const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
                const response = await fetch(`${API_BASE_URL}/vibe/map-data`);
                if (!response.ok) {
                    console.warn('Failed to fetch venue data for enrichment, using liked venues as-is');
                    return;
                }
                const data = await response.json();
                setAllVenues(data.locations || []);
                
                // Busyness data is now handled by separate useEffect
            } catch (err) {
                console.error("Failed to fetch data:", err);
                // Don't set any fallback data - just use likedVenues as-is
            }
        };
        loadData();
    }, []); // Empty dependency array - only run once on mount

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
            // Try to find a match by id, then lat/lng
            let full = allVenues.find(v => v.id === liked.id);
            if (!full && liked.lat && liked.lng) {
                full = allVenues.find(v => v.latitude === liked.lat && v.longitude === liked.lng);
            }
            
            // If no enrichment data found, just return the liked venue as-is
            if (!full) {
                return liked;
            }
            
            let enriched = { ...full, ...liked };
            // Always ensure a canonical id
            enriched.id = enriched.id || liked.id;
            
            // Add zoneId if missing
            if (!enriched.zoneId && enriched.lat && enriched.lng) {
                const venuePoint = turfPoint([enriched.lng, enriched.lat]);
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
                        You haven't liked any venues yet.
                    </Typography>
                ) : (
                    <Grid container spacing={2} justifyContent="center" display="flex">
                        {filteredVenues.map((venue) => (
                            <Grid item xs={12} sm={6} md={4} key={venue.id}>
                                <TrendingVenueCard 
                                    venue={venue} 
                                    busynessMap={busynessMap} 
                                    showLikeButton={true} 
                                    unlikeOnlyFromFavorites={true} 
                                    tags={venue.tags}
                                    hidePlanButtons={false}
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