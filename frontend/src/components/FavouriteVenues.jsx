import React from 'react';
import { Box, Typography, Grid } from '@mui/material';
import TrendingVenueCard from './TrendingVenueCard'; // Adjust path


// replace with real user likes )
const likedVenues = [
    {
        id: 1,
        name: 'Sunset Bar',
        description: 'Great vibes and music',
        tags: ['music', 'cocktails'],
        trending: true,
        price: '$$',
        image: '/images/sunset.jpg',
    },
    {
        id: 2,
        name: 'Rooftop Lounge',
        description: 'Perfect for a chill night',
        tags: ['view', 'relax'],
        trending: false,
        price: '$$$',
        image: '/images/rooftop.jpg',
    },
];

function FavouriteVenues() {
    return (
        <Box sx={{ width: '100%', p: 3 }}>
            <Typography variant="h5" gutterBottom>
                Your Favorite Venues
            </Typography>

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
    );
}

export default FavouriteVenues;