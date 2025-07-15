import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';

const LikeContext = createContext();

export const useLike = () => useContext(LikeContext);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

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
                    setLikedVenues(data || []); // Assuming backend returns an array of venues
                } catch (error) {
                    // Only log errors that are not the expected "Not authenticated" message
                    if (error.message !== "Not authenticated. Please log in.") {
                        console.error("Failed to fetch liked venues:", error);
                    }
                }
            } else {
                setLikedVenues([]); // Clear likes on logout
            }
        };
        fetchLikes();
    }, [isAuthenticated, makeAuthenticatedRequest]);

    // Toggle a like and send the update to the backend
    const handleLike = useCallback(async (venue) => {
        if (!isAuthenticated) return;

        const isLiked = likedVenues.some(v => v.id === venue.id);
        const endpoint = isLiked
            ? `${API_BASE_URL}/favourites/${venue.id}` // Endpoint for DELETE
            : `${API_BASE_URL}/favourites`;           // Endpoint for POST
        const method = isLiked ? 'DELETE' : 'POST';

        // Store the previous state in case we need to revert
        const previousLikedVenues = [...likedVenues];

        try {
            // Optimistically update the UI for a faster user experience
            if (isLiked) {
                setLikedVenues(prev => prev.filter(v => v.id !== venue.id));
            } else {
                setLikedVenues(prev => {
                    // If this venue already exists in prev (with more fields), merge them
                    const existing = prev.find(v => v.id === venue.id);
                    return [...prev, { ...existing, ...venue, isLiked: true }];
                });
            }
            // Make the API call
            await makeAuthenticatedRequest(endpoint, {
                method,
                // Only send a body for the POST request
                body: method === 'POST' ? JSON.stringify({ venueId: venue.id }) : null,
            });
        } catch (error) {
            console.error(`Failed to ${isLiked ? 'unlike' : 'like'} venue:`, error);
            // Revert the optimistic update on failure
            setLikedVenues(previousLikedVenues);
        }
    }, [isAuthenticated, likedVenues, makeAuthenticatedRequest]);

    return (
        <LikeContext.Provider value={{ likedVenues, handleLike }}>
            {children}
        </LikeContext.Provider>
    );
};