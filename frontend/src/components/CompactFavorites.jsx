// component to show a hroizontally scrollable list of liked venues
// uses VenueCard component to display favourite venues

import { Box, Typography, IconButton } from "@mui/material";
import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import { useLike } from "../context/LikeContext";
import VenueCard from "./VenueCard";
import { useEffect, useState, useRef } from "react";
import { Favorite as FavoriteIcon } from "@mui/icons-material";

export default function CompactFavorites() {
    const { likedVenues, handleLike } = useLike();
    const scrollRef = useRef(null);
    const [showArrows, setShowArrows] = useState(false);
    const [busynessMap, setBusynessMap] = useState({});
    const [enrichedVenues, setEnrichedVenues] = useState([]);
    const [allVenues, setAllVenues] = useState([]);

    // fetch busyness and location data
    useEffect(() => {
        fetch("/api/vibe/map-data")
            .then((res) => res.json())
            .then((data) => {
                setBusynessMap(data.busyness || {});
                setAllVenues(data.locations || []);
            })
            .catch((err) => console.error("Failed to fetch busyness data:", err));
    }, []);

    // Enrich likedVenues with full data from allVenues
    useEffect(() => {
        if (allVenues.length === 0) {
            setEnrichedVenues(likedVenues);
            return;
        }
        const merged = likedVenues.map(liked => {
            const full = allVenues.find(v => v.id === liked.id);
            return { ...full, ...liked };
        });
        setEnrichedVenues(merged);
    }, [likedVenues, allVenues]);

    // Show/hide chevrons based on overflow
    useEffect(() => {
        const checkOverflow = () => {
            if (scrollRef.current) {
                setShowArrows(scrollRef.current.scrollWidth > scrollRef.current.clientWidth);
            }
        };
        checkOverflow();
        window.addEventListener('resize', checkOverflow);
        return () => window.removeEventListener('resize', checkOverflow);
    }, [enrichedVenues]);

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
                You haven’t added any favourites yet.
            </Typography>
        );
    }

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
                {showArrows && (
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
                )}

                {/* Right Chevron */}
                {showArrows && (
                <IconButton
                    onClick={() => handleScroll("right")}
                    sx={{
                        position: "absolute",
                        right: -10,
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
                    <ChevronRight />
                </IconButton>
                )}

                {/* Scrollable venue cards */}
                <Box
                    ref={scrollRef}
                    sx={{
                        display: "flex",
                        position: "relative",
                        overflowX: "auto",
                        overflowY: "hidden", // Prevent vertical scroll
                        gap: 2,
                        pb: 1,
                        px: 2,
                    }}
                >
                    {enrichedVenues.map((venue) => (
                        <VenueCard
                            key={venue.id}
                            venue={venue}
                            variant="compact"
                            busynessMap={busynessMap}
                            tags={venue.tags}
                            showLikeButton={true}
                            onLike={() => handleLike(venue)}
                            disableActions={true}
                            highlighted={true}
                        />
                    ))}
                </Box>
            </Box>
        </Box>
    );
}