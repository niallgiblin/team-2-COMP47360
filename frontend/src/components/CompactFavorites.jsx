// component to show a hroizontally scrollable list of liked venues
// uses VenueCard component to display favourite venues

import { Box, Typography, IconButton, Button } from "@mui/material";
import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import { useLike } from "../context/LikeContext";
import { usePlan } from "../context/PlanContext";
import { useBusyness } from "../context/BusynessContext";
import VenueCard from "./VenueCard";
import { useEffect, useState, useRef } from "react";
import { Favorite as FavoriteIcon } from "@mui/icons-material";

export default function CompactFavorites() {
    const { likedVenues, handleLike } = useLike();
    const { plan, addToPlan, removeFromPlan, isInPlan } = usePlan();
    const { busynessData: contextBusynessData, venueData: cachedVenues, fetchAllData } = useBusyness();
    const scrollRef = useRef(null);
    const [enrichedVenues, setEnrichedVenues] = useState([]);

    // Use cached venue data if available
    useEffect(() => {
        if (cachedVenues && cachedVenues.length > 0) {
            // Enrich liked venues with cached data
            const merged = likedVenues.map(liked => {
                const full = cachedVenues.find(v => v.id === liked.id);
                return { ...full, ...liked };
            });
            setEnrichedVenues(merged);
        } else {
            setEnrichedVenues(likedVenues);
        }
    }, [likedVenues, cachedVenues]);

    // handler for left/right chevrons
    const handleScroll = (direction) => {
        const container = scrollRef.current;
        if (!container) return;
        const scrollAmount = 300;
        container.scrollBy({
            left: direction === "left" ? -scrollAmount : scrollAmount,
            behavior: "smooth",
        });
    };

    // if no liked venues, show message instead
    if (!enrichedVenues || enrichedVenues.length === 0) {
        return (
            <Typography
                sx={{
                    mt: 2,
                    color: "#888",
                    textAlign: "center",
                }}
            >
                You haven't added any favourites yet.
            </Typography>
        );
    }

    return (
        <Box>
            <Box
                sx={{
                    position: "relative",
                    width: "100%",
                    overflow: "hidden",
                }}
            >
                {/* Left Chevron */}
                <IconButton
                    onClick={() => handleScroll("left")}
                    sx={{
                        position: "absolute",
                        left: -10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        zIndex: 2,
                        color: "#FF4ECD",
                        backgroundColor: "#000",
                        "&:hover": {
                            backgroundColor: "#111",
                        },
                    }}
                >
                    <ChevronLeft />
                </IconButton>

                {/* Right Chevron */}
                <IconButton
                    onClick={() => handleScroll("right")}
                    sx={{
                        position: "absolute",
                        right: -10,
                        top: "52%",
                        transform: "translateY(-50%)",
                        zIndex: 2,
                        color: "#FF4ECD",
                        backgroundColor: "#000",
                        "&:hover": {
                            backgroundColor: "#111",
                        },
                    }}
                >
                    <ChevronRight />
                </IconButton>

                {/* Scrollable venue cards */}
                <Box
                    ref={scrollRef}
                    sx={{
                        display: "flex",
                        position: "relative",
                        overflowX: "auto",
                        gap: 2,
                        pb: 1,
                        px: 2,
                    }}
                >
                    {enrichedVenues.map((venue) => {
                        const isInCurrentPlan = isInPlan(venue);
                        return (
                            <Box
                                key={venue.id}
                                sx={{
                                    position: "relative",
                                    minWidth: 180,
                                    maxWidth: 250,
                                    backgroundColor: "#111",
                                    border: "1px solid #900B6A",
                                    borderRadius: 2,
                                    p: 2,
                                    flexShrink: 0,
                                }}
                            >
                                {/* Like Button */}
                                <IconButton
                                    onClick={() => handleLike(venue)}
                                    sx={{
                                        position: "absolute",
                                        top: 8,
                                        right: 8,
                                        zIndex: 10,
                                        background: "linear-gradient(to right, #3ABEFF, #FF4ECD)",
                                        color: "#fff",
                                        width: 32,
                                        height: 32,
                                        padding: 0,
                                        borderRadius: "50%",
                                        boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                                        "&:hover": {
                                            background: "linear-gradient(to right, #FF4ECD, #3ABEFF)",
                                        },
                                    }}
                                >
                                    <FavoriteIcon sx={{ fontSize: 18 }} />
                                </IconButton>

                                {/* Venue content */}
                                <VenueCard venue={venue} variant="compact" disableActions={true} tags={venue.tags} />
                                
                                {/* Add to Plan Button */}
                                <Button
                                    onClick={() => isInCurrentPlan ? removeFromPlan(venue.id) : addToPlan(venue)}
                                    sx={{
                                        width: "100%",
                                        mt: 1,
                                        background: isInCurrentPlan 
                                            ? "linear-gradient(to right, #FF4ECD, #3ABEFF)"
                                            : "linear-gradient(to right, #3ABEFF, #FF4ECD)",
                                        color: "#000",
                                        fontWeight: "bold",
                                        fontSize: "0.75rem",
                                        py: 0.5,
                                        borderRadius: 1,
                                        "&:hover": {
                                            background: isInCurrentPlan 
                                                ? "linear-gradient(to right, #3ABEFF, #FF4ECD)"
                                                : "linear-gradient(to right, #FF4ECD, #3ABEFF)",
                                        },
                                    }}
                                >
                                    {isInCurrentPlan ? "Remove from Plan" : "Add to Plan"}
                                </Button>
                            </Box>
                        );
                    })}
                </Box>
            </Box>
        </Box>
    );
}