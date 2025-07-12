import React, { createContext, useContext, useState } from 'react';

const LikeContext = createContext();

export const useLikes = () => useContext(LikeContext);

export const LikeProvider = ({ children }) => {
    const [likedVenues, setLikedVenues] = useState([]);

    const toggleLike = (venue) => {
        setLikedVenues((prev) => {
            const exists = prev.find((v) => v.id === venue.id);
            if (exists) {
                return prev.filter((v) => v.id !== venue.id);
            } else {
                return [...prev, venue];
            }
        });
    };

    return (
        <LikeContext.Provider value={{ likedVenues, toggleLike }}>
            {children}
        </LikeContext.Provider>
    );
};