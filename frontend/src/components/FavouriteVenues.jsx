import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid } from '@mui/material';
import TrendingVenueCard from './TrendingVenueCard';
import { useLikes } from '../context/LikeContext';
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";

function FavouriteVenues() {
    const { likedVenues } = useLikes();
    const [busynessMap, setBusynessMap] = useState({});
    const [zoneData, setZoneData] = useState(null);
    const [enrichedVenues, setEnrichedVenues] = useState([]);

    useEffect(() => {
        fetch("http://localhost:8080/vibe/map-data")
            .then((res) => res.json())
            .then((data) => setBusynessMap(data.busyness || {}))
            .catch((err) => console.error("Failed to fetch busyness data:", err));
    }, []);

    useEffect(() => {
        fetch("/manhattanZones.geojson")
            .then((res) => res.json())
            .then((data) => setZoneData(data))
            .catch((err) => console.error("Failed to load zone data:", err));
    }, []);

    useEffect(() => {
        if (zoneData && likedVenues.length > 0) {
            const venuesWithZoneId = likedVenues.map(venue => {
                if (venue.zoneId || !venue.latitude || !venue.longitude) return venue;
                const venuePoint = turfPoint([venue.longitude, venue.latitude]);
                const matchingZone = zoneData.features.find(feature => booleanPointInPolygon(venuePoint, feature.geometry));
                return { ...venue, zoneId: matchingZone ? matchingZone.properties.LocationID : undefined };
            });
            setEnrichedVenues(venuesWithZoneId);
        } else {
            setEnrichedVenues(likedVenues);
        }
    }, [likedVenues, zoneData]);

    return (
        <Box sx={{ width: '100%' }}>
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 'bold' }}>
                Your Favorite Venues
            </Typography>

            <Box
                sx={{
                    border: '1px solid #900B6A',
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
                    <Grid
                        container
                        spacing={2}
                        justifyContent="center"
                    >
                        {enrichedVenues.map((venue) => (
                            <Grid item xs={12} sm={6} md={4} key={venue.id}>
                                <TrendingVenueCard
                                    venue={venue}
                                    busynessMap={busynessMap}
                                    showLikeButton={true}
                                    unlikeOnlyFromFavorites={true}
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