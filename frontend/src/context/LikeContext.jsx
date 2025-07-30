import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useBusyness } from './BusynessContext';
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";

const LikeContext = createContext();

export const useLike = () => useContext(LikeContext);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

export const LikeProvider = ({ children }) => {
    const [likedVenues, setLikedVenues] = useState([]);
    const { isAuthenticated, makeAuthenticatedRequest } = useAuth();
    
    const { busynessData: contextBusynessData, venueData: cachedVenues, getBusynessLabel } = useBusyness();

    // Fetch liked venues from the backend when the user is authenticated
    useEffect(() => {
        const fetchLikes = async () => {
            if (!isAuthenticated) return;
            try {
                const res = await makeAuthenticatedRequest(`${API_BASE_URL}/favourites`);
                if (!res.ok) throw new Error('Failed to fetch');
                const data = await res.json();

                
                // Transform backend data structure to frontend expected format
                const processedVenues = new Set(); // Track processed venues to avoid duplicates
                const transformedData = await Promise.all(Array.isArray(data) ? data.map(async favourite => {
                    if (favourite.location) {
                        // Backend returns {id: favId, location: {venueData}, likedAt: timestamp}
                        // Frontend expects flat venue object with venue ID as id
                        const venue = {
                            ...favourite.location,
                            id: favourite.location.id, // Use location ID as the primary ID
                            favouriteId: favourite.id, // Keep the favourite ID for reference
                            likedAt: favourite.likedAt,
                            isLiked: true
                        };
                        
                        // Skip if we've already processed this venue
                        if (processedVenues.has(venue.id)) {
                            return null;
                        }
                        processedVenues.add(venue.id);
                        

                        
                        // Try to get busyness data by matching with cached venue data
                        if (cachedVenues && cachedVenues.length > 0) {
                            // Try to find matching venue by ID first, then by name
                            const matchingVenue = cachedVenues.find(cached => 
                                cached.id === venue.id || 
                                cached.placeId === venue.id ||
                                (cached.name && venue.name && cached.name.toLowerCase() === venue.name.toLowerCase())
                            );
                            
                            if (matchingVenue && matchingVenue.busynessLabel) {
                                venue.busynessValue = matchingVenue.busynessValue;
                                venue.busynessLabel = matchingVenue.busynessLabel;
                                venue.zoneId = matchingVenue.zoneId;
                            }
                        }
                        
                        // If we still don't have busyness data, try to compute it from context data
                        if (!venue.busynessLabel && contextBusynessData && contextBusynessData.length > 0) {
                            // Try to find zoneId from venue data
                            let zoneId = venue.zoneId;
                            
                            // If no zoneId, try to find it by matching with cached venues
                            if (!zoneId && cachedVenues && cachedVenues.length > 0) {
                                const matchingVenue = cachedVenues.find(cached => 
                                    cached.id === venue.id || 
                                    cached.placeId === venue.id ||
                                    (cached.name && venue.name && cached.name.toLowerCase() === venue.name.toLowerCase())
                                );
                                if (matchingVenue && matchingVenue.zoneId) {
                                    zoneId = matchingVenue.zoneId;
                                }
                            }
                            
                            if (zoneId) {
                                const busynessEntry = contextBusynessData.find(item => 
                                    String(item.LocationID) === String(zoneId)
                                );
                                if (busynessEntry) {
                                    venue.busynessValue = busynessEntry.busyness;
                                    venue.busynessLabel = getBusynessLabel(busynessEntry.busyness);
                                    venue.zoneId = zoneId; // Store the zoneId for future use
                                }
                            }
                        }
                        
                        return venue;
                    }
                    return favourite; // Fallback if structure is different
                }) : []);
                
                // Filter out null values (duplicates)
                const filteredData = transformedData.filter(venue => venue !== null);
                
                // Merge with existing liked venues to preserve busyness data
                setLikedVenues(prevLikedVenues => {
                    const mergedVenues = filteredData.map(backendVenue => {
                        // Check if we already have this venue with busyness data
                        const existingVenue = prevLikedVenues.find(v => v.id === backendVenue.id);
                        if (existingVenue && existingVenue.busynessLabel && existingVenue.busynessLabel !== 'No Data') {
                            // Preserve existing busyness data
                            return {
                                ...backendVenue,
                                busynessLabel: existingVenue.busynessLabel,
                                busynessValue: existingVenue.busynessValue,
                                zoneId: existingVenue.zoneId
                            };
                        }
                        return backendVenue;
                    });
                    return mergedVenues;
                });
            } catch (err) {
                console.error('Failed to fetch liked venues:', err);
                setLikedVenues([]); // Show empty state if backend fetch fails
            }
        };
        fetchLikes();
    }, [isAuthenticated, makeAuthenticatedRequest]);

    // Toggle a like and send the update to the backend
    const handleLike = useCallback(async (venue) => {
        // Always use canonical backend id (integer)
        const canonicalId = venue.id;
        if (!canonicalId || typeof canonicalId !== 'number') {
            console.error('Venue missing valid integer id:', venue);
            return;
        }
        
        // Check if venue is already liked (after transformation, venues are flat)
        const isLiked = likedVenues.some(v => v.id === canonicalId);
        
        const previousLikedVenues = [...likedVenues];

        try {
            // Update local state immediately for better UX
            if (isLiked) {
                setLikedVenues(prev => prev.filter(v => v.id !== canonicalId));
            } else {
                setLikedVenues(prev => {
                    const existing = prev.find(v => v.id === canonicalId);
                    // Ensure we preserve busyness data when adding to favorites
                    const enrichedVenue = {
                        ...venue,
                        id: canonicalId,
                        isLiked: true,
                        // Preserve busyness data if available
                        busynessLabel: venue.busynessLabel || existing?.busynessLabel,
                        busynessValue: venue.busynessValue || existing?.busynessValue,
                        zoneId: venue.zoneId || existing?.zoneId
                    };
                    return [...prev, enrichedVenue];
                });
            }

            // If authenticated, also update backend
            if (isAuthenticated) {
                const endpoint = isLiked
                    ? `${API_BASE_URL}/favourites/${canonicalId}` // Endpoint for DELETE
                    : `${API_BASE_URL}/favourites`;           // Endpoint for POST
                const method = isLiked ? 'DELETE' : 'POST';

                const response = await makeAuthenticatedRequest(endpoint, {
                    method,
                    body: method === 'POST' ? JSON.stringify({ venueId: canonicalId }) : null,
                });
                if (!response.ok) {
                    throw new Error(`Failed to ${isLiked ? 'unlike' : 'like'} venue: ${response.statusText}`);
                }
            }
        } catch (error) {
            console.error(`Failed to ${isLiked ? 'unlike' : 'like'} venue:`, error);
            // Revert local state if backend update failed
            setLikedVenues(previousLikedVenues);
        }
    }, [isAuthenticated, likedVenues, makeAuthenticatedRequest]);

    const clearLikes = () => {
        setLikedVenues([]);
    };

    return (
        <LikeContext.Provider value={{ likedVenues, handleLike, clearLikes }}>
            {children}
        </LikeContext.Provider>
    );
};