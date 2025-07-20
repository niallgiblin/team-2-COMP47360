import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';

const LikeContext = createContext();

export const useLike = () => useContext(LikeContext);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://34.246.193.191:8080/api';

export const LikeProvider = ({ children }) => {
    const [likedVenues, setLikedVenues] = useState([]);
    const { isAuthenticated, makeAuthenticatedRequest } = useAuth();

    // Fetch liked venues from the backend when the user is authenticated
    useEffect(() => {
        const fetchLikes = async () => {
            if (isAuthenticated) {
                try {
                    const response = await makeAuthenticatedRequest(`${API_BASE_URL}/favourites`);
                    const data = await response.json();
                    // Store only the location objects (LocationDto), not the FavouriteDto wrapper
                    setLikedVenues((data || []).map(fav => fav.location));
                } catch (error) {
                    if (error.message !== "Not authenticated. Please log in.") {
                        console.error("Failed to fetch liked venues:", error);
                    }
                }
            } else {
                setLikedVenues([]);
            }
        };
        fetchLikes();
    }, [isAuthenticated, makeAuthenticatedRequest]);

    // Toggle a like and send the update to the backend
    const handleLike = useCallback(async (venue) => {
        if (!isAuthenticated) return;

        // Always use canonical backend id (integer)
        const canonicalId = venue.id;
        if (!canonicalId || typeof canonicalId !== 'number') {
            console.error('Venue missing valid integer id:', venue);
            return;
        }
        const isLiked = likedVenues.some(v => v.id === canonicalId);
        const endpoint = isLiked
            ? `${API_BASE_URL}/favourites/${canonicalId}` // Endpoint for DELETE
            : `${API_BASE_URL}/favourites`;           // Endpoint for POST
        const method = isLiked ? 'DELETE' : 'POST';

        const previousLikedVenues = [...likedVenues];

        try {
            if (isLiked) {
                setLikedVenues(prev => prev.filter(v => v.id !== canonicalId));
            } else {
                setLikedVenues(prev => {
                    const existing = prev.find(v => v.id === canonicalId);
                    return [...prev, { ...existing, ...venue, id: canonicalId, isLiked: true }];
                });
            }
            const response = await makeAuthenticatedRequest(endpoint, {
                method,
                body: method === 'POST' ? JSON.stringify({ venueId: canonicalId }) : null,
            });
            if (!response.ok) {
                throw new Error(`Failed to ${isLiked ? 'unlike' : 'like'} venue: ${response.statusText}`);
            }
        } catch (error) {
            console.error(`Failed to ${isLiked ? 'unlike' : 'like'} venue:`, error);
            setLikedVenues(previousLikedVenues);
        }
    }, [isAuthenticated, likedVenues, makeAuthenticatedRequest]);

    return (
        <LikeContext.Provider value={{ likedVenues, handleLike }}>
            {children}
        </LikeContext.Provider>
    );
};