import React from 'react';
import { Box, Typography, Grid } from '@mui/material';
import TrendingVenueCard from './TrendingVenueCard';
import { useLikes } from '../context/LikeContext';

function FavouriteVenues() {
    const { likedVenues } = useLikes();

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
                {likedVenues.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                        You haven’t liked any venues yet.
                    </Typography>
                ) : (
                    <Grid container spacing={2}>
                        {likedVenues.map((venue) => (
                            <Grid item xs={12} sm={6} md={4} key={venue.id}>
                                <TrendingVenueCard venue={venue} showLikeButton={false} />
                            </Grid>
                        ))}
                    </Grid>
                )}
            </Box>
        </Box>
    );
}

export default FavouriteVenues;