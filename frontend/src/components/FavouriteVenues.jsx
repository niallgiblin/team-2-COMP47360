import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import TrendingVenueCard from './TrendingVenueCard'; 
import { useLike } from '../context/LikeContext'; 
import { useBusyness } from '../context/BusynessContext';
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";

// Error boundary for context availability
class ContextErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    render() {
        if (this.state.hasError) {
            return (
                <Box sx={{ width: '100%' }}>
                    <Typography variant="h5" gutterBottom sx={{ color: '#fff', mb: 2 }}>
                        Your Favorite Venues
                    </Typography>
                    <Box
                        sx={{
                            border: '1px solid #ff00cc',
                            borderRadius: '16px',
                            padding: 3,
                            backgroundColor: '#000',
                            color: '#fff',
                        }}
                    >
                        <Typography variant="body2" color="text.secondary">
                            Loading favorites...
                        </Typography>
                    </Box>
                </Box>
            );
        }

        return this.props.children;
    }
}

function FavouriteVenues() {
    const { likedVenues } = useLike();
    const { busynessData: contextBusynessData, venueData: cachedVenues, isInitialized, getBusynessLabel } = useBusyness();
    const [zoneData, setZoneData] = useState(null);
    const [enrichedVenues, setEnrichedVenues] = useState([]);





    // Fetch zone data for geo-lookups (only once)
    useEffect(() => {
        fetch("/manhattanZones.geojson")
            .then((res) => res.json())
            .then((data) => setZoneData(data))
            .catch((err) => console.error("Failed to load zone data:", err));
    }, []);

    // Enrich liked venues with full data from context
    useEffect(() => {
        if (likedVenues.length === 0) {
            setEnrichedVenues(likedVenues);
            return;
        }
        
        // Use enriched venue data from context if available
        const merged = likedVenues.map(liked => {
            // Try to find a match by id, then lat/lng
            let full = cachedVenues.find(v => v.id === liked.id);
            if (!full && liked.lat && liked.lng) {
                full = cachedVenues.find(v => v.latitude === liked.lat && v.longitude === liked.lng);
            }
            
            // If no enrichment data found, just return the liked venue as-is
            if (!full) {
                return liked;
            }
            
            // Merge data, but preserve busyness data from liked venue if it exists
            let enriched = { ...full, ...liked };
            

            

            
            // Preserve busyness data from liked venue if it exists
            if (liked.busynessLabel && liked.busynessLabel !== 'No Data') {
                enriched.busynessLabel = liked.busynessLabel;
            }
            if (liked.busynessValue !== null && liked.busynessValue !== undefined) {
                enriched.busynessValue = liked.busynessValue;
            }
            
            // If no busyness data from liked venue, try to compute it from context
            if (!enriched.busynessLabel && enriched.zoneId && contextBusynessData && contextBusynessData.length > 0) {
                const busynessEntry = contextBusynessData.find(item => 
                    String(item.LocationID) === String(enriched.zoneId)
                );
                if (busynessEntry) {
                    enriched.busynessValue = busynessEntry.busyness;
                    enriched.busynessLabel = getBusynessLabel(busynessEntry.busyness);
                }
            }
            

            
            // Always ensure a canonical id
            enriched.id = enriched.id || liked.id;
            
            // Add zoneId if missing (fallback to geo lookup)
            if (!enriched.zoneId && enriched.lat && enriched.lng && zoneData) {
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
    }, [likedVenues, cachedVenues, zoneData]);

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
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {filteredVenues.map((venue) => (
                            <TrendingVenueCard 
                                key={venue.id}
                                venue={venue} 
                                showLikeButton={true} 
                                unlikeOnlyFromFavorites={true} 
                                tags={venue.tags}
                                hidePlanButtons={false}
                            />
                        ))}
                    </Box>
                )}
            </Box>
        </Box>
    );
}

// Export with error boundary wrapper
export default function FavouriteVenuesWithErrorBoundary() {
    return (
        <ContextErrorBoundary>
            <FavouriteVenues />
        </ContextErrorBoundary>
    );
}