import { Box, Typography, IconButton } from "@mui/material";
import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import { useLikes } from "../context/LikeContext";
import VenueCard from "./VenueCard";
import { useRef } from "react";
import { Favorite as FavoriteIcon } from "@mui/icons-material";

export default function CompactFavorites() {
    const { likedVenues, toggleLike } = useLikes();
    const scrollRef = useRef(null);

    const handleScroll = (direction) => {
        const container = scrollRef.current;
        if (!container) return;
        const scrollAmount = 300;
        container.scrollBy({
            left: direction === "left" ? -scrollAmount : scrollAmount,
            behavior: "smooth",
        });
    };

    if (!likedVenues || likedVenues.length === 0) {
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
                    {likedVenues.map((venue) => (
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
                            {/* Updated Like Button */}
                            <IconButton
                                onClick={() => toggleLike(venue)}
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
                            <VenueCard venue={venue} variant="compact" />
                        </Box>
                    ))}
                </Box>
            </Box>
        </Box>
    );
}