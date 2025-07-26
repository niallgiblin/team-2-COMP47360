import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';

const LikeContext = createContext();

export const useLike = () => useContext(LikeContext);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const LikeProvider = ({ children }) => {
    const [likedVenues, setLikedVenues] = useState([]);
    const { isAuthenticated, makeAuthenticatedRequest } = useAuth();

    // Fetch liked venues from the backend when the user is authenticated
    useEffect(() => {
        const fetchLikes = async () => {
            if (!isAuthenticated) return;
            try {
                const res = await makeAuthenticatedRequest(`${API_BASE_URL}/favourites`);
                if (!res.ok) throw new Error('Failed to fetch');
                const data = await res.json();
                
                // Transform backend data structure to frontend expected format
                const transformedData = Array.isArray(data) ? data.map(favourite => {
                    if (favourite.location) {
                        // Backend returns {id: favId, location: {venueData}, likedAt: timestamp}
                        // Frontend expects flat venue object with venue ID as id
                        return {
                            ...favourite.location,
                            id: favourite.location.id, // Use location ID as the primary ID
                            favouriteId: favourite.id, // Keep the favourite ID for reference
                            likedAt: favourite.likedAt,
                            isLiked: true
                        };
                    }
                    return favourite; // Fallback if structure is different
                }) : [];
                
                setLikedVenues(transformedData);
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
                    return [...prev, { ...venue, id: canonicalId, isLiked: true }];
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