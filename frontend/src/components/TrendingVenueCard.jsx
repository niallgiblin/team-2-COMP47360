// component with detailed venue information
// used on Recommendations.jsx (What's Hot) page, FindMyVibe.jsx page

import {
  Card,
  CardMedia,
  Typography,
  Box,
  Button,
  Chip,
  IconButton,
} from "@mui/material";

import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePlan } from "../context/PlanContext";
import { useBusyness } from "../context/BusynessContext";
import { categoryImages, getCategory } from "../utils/tagMapping";
import { useMemo } from "react";

// import icons for feedback, tags, price etc
import {
  Favorite as FavoriteIcon,
  FavoriteBorder as FavoriteBorderIcon,
  Whatshot as WhatshotIcon,
  AttachMoney as AttachMoneyIcon,
  Launch as LaunchIcon,
  Star as StarIcon,
  StarHalf as StarHalfIcon,
  StarBorder as StarBorderIcon,
} from "@mui/icons-material";

import { useLike } from "../context/LikeContext";

export default function TrendingVenueCard({
  venue,
  busynessMap = {},
  showLikeButton = true,
  unlikeOnlyFromFavorites = false,
  tags,
  hidePlanButtons = false,
}) {
  const { setSelectedVenue, setFromPlan } = usePlan();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { likedVenues, handleLike } = useLike();
  const { busynessData: contextBusynessData } = useBusyness();

  // check if current venue is in favourites
  const isLiked = likedVenues.some((v) => v.id === venue.id);

  // check both string and numeric rating for price
  const priceLevels = {
    "price level very cheap": 1,
    "price level cheap": 2,
    "price level moderate": 3,
    "price level expensive": 4,
    "price level very expensive": 5,
  };

  let level = 0;
  if (typeof venue.price === "number") {
    level = venue.price;
  } else if (typeof venue.price === "string") {
    const normalizedPrice = venue.price.trim().toLowerCase();
    level = priceLevels[normalizedPrice] || 0;
  }

  // check if venue is already in the plan, and if plan is full
  const { plan, addToPlan, removeFromPlan } = usePlan();
  const isInPlan = plan.some((v) => v.id === venue.id);
  const isPlanFull = plan.length >= 5;

  // select a category image 
  // Use the same logic as VenueCard for category and image selection
  let category = 'default';
  if (venue.isRestaurant) category = 'restaurant';
  else if (venue.isBar) category = 'bar';
  else if (venue.isClub) category = 'club';
  else if (venue.isLandmark) category = 'landmark';
  else category = getCategory(venue.description || '');
  const imageUrl = venue.imageUrl || categoryImages[category] || categoryImages.default;

  // event handling for Add to Plan button
  const handleAddToPlan = (e) => {
    e.stopPropagation(); // Prevent event bubbling
    if (!isAuthenticated) {
      navigate("/login", {
        state: { message: "Please log in to add items to your plan." },
      });
    } else {
      addToPlan(venue);
    }
  };

  // event handling for Remove from Plan
  const handleRemoveFromPlan = (e) => {
    e.stopPropagation(); // Prevent event bubbling
    removeFromPlan(venue.id);
  };

  // event handling for Like button
  const handleLikeClick = (e) => {
    e.stopPropagation(); // Prevent event bubbling
    if (unlikeOnlyFromFavorites && isLiked) {
      handleLike(venue);
    } else if (!unlikeOnlyFromFavorites) {
      handleLike(venue);
    }
  };

  const handleWebsiteClick = (e) => {
    e.stopPropagation(); // Prevent event bubbling
    if (venue.uri) {
      window.open(venue.uri, "_blank");
    }
  };

  // event handling for map navigation
  const handleMapNavigation = (e) => {
    e.stopPropagation(); // Prevent event bubbling
    setSelectedVenue(venue);
    setFromPlan(false);
    navigate("/map");
  };

  const busynessLabel = useMemo(() => {
    if (!venue.zone || venue.zone === "nan") return null;
    
    // Try to get busyness from context first, then fallback to prop
    const zoneKey = String(venue.zoneId);
    let value = null;
    
    // Check context data first
    if (contextBusynessData && contextBusynessData.length > 0) {
      const contextEntry = contextBusynessData.find(item => 
        String(item.LocationID).replace(" NET", "") === zoneKey
      );
      if (contextEntry) {
        value = contextEntry.busyness;
      }
    }
    
    // Fallback to prop if not found in context
    if (value === null) {
      value = busynessMap[zoneKey];
    }
    
    if (typeof value !== "number") {
      return "No Data";
    }
    const percent = value * 100;
    if (percent >= 75) return "Very Busy";
    if (percent >= 50) return "Busy";
    if (percent >= 25) return "Moderate";
    return "Quiet";
  }, [venue.zoneId, contextBusynessData, busynessMap]);

  // Render tags as chips if present
  const tagList = tags || venue.tags || [];

  return (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        justifyContent: "center",
        mt: 4,
      }}
    >
      {/* Like button */}
      {showLikeButton && (
        <IconButton
          onClick={handleLikeClick} // event handler
          sx={{
            position: "absolute",
            top: -12,
            right: 12,
            zIndex: 10, // ensure it's above other elements
            background: "linear-gradient(to right, #3ABEFF, #FF4ECD)",
            color: "#fff",
            width: 32,
            height: 32,
            padding: 0,
            borderRadius: "50%",
            boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
            "&:hover": {
              background: "linear-gradient(to right, #FF4ECD, #3ABEFF)",
              transform: "scale(1.05)", // Subtle hover effect
            },
            "&:active": {
              transform: "scale(0.95)", // Click feedback
            },
            transition: "all 0.2s ease", // Smooth transitions
          }}
        >
          {isLiked ? (
            <FavoriteIcon sx={{ fontSize: 18 }} />
          ) : (
            <FavoriteBorderIcon sx={{ fontSize: 18 }} />
          )}
        </IconButton>
      )}

      {/* Venue card layout */}
      <Card
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 2,
          p: 2,
          mb: 3,
          backgroundColor: "#1a1a1a",
          borderRadius: 3,
          color: "#fff",
          boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
          width: "100%",
          maxWidth: 600,
          minHeight: 120,
          position: "relative",
        }}
      >
        {/* Image and info section */}
        <Box 
          sx={{ 
            display: "flex", 
            gap: 2, 
            flex: 1, 
            minWidth: 0 
          }}
        >
          <CardMedia
            component="img"
            image={imageUrl}
            alt={venue.name}
            sx={{
              width: 80,
              height: 80,
              borderRadius: 2,
              objectFit: "cover",
              flexShrink: 0,
            }}
          />

          <Box 
            sx={{ 
              flexGrow: 1, 
              minWidth: 0 
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "baseline",
                gap: 1,
                flexWrap: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: "bold", color: "#fff" }}
              >
                {venue.name}
              </Typography>

              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: "bold",
                  color: "#ccc",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "80%",
                }}
              >
                · {category.charAt(0).toUpperCase() + category.slice(1)} ·{" "}
                {venue.zone && venue.zone !== "nan" ? venue.zone : "Manhattan"}
              </Typography>
            </Box>

            <Typography
              variant="body2"
              sx={{
                color: "#aaa",
                mb: 1,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {venue.summary || venue.description || ""}
            </Typography>

            {/* Actions */}
            <Box
              sx={{
                display: "flex",
                gap: 1,
                flexWrap: "wrap",
              }}
            >
              <Button
                variant="text"
                size="small"
                onClick={handleMapNavigation} // event handler
                sx={{
                  color: "#3ABEFF",
                  textTransform: "none",
                  fontWeight: 600,
                  px: 0,
                  "&:hover": {
                    backgroundColor: "rgba(58, 190, 255, 0.1)", // hover effect
                  },
                }}
              >
                View on Map
              </Button>

              {venue.uri && (
                <Button
                  variant="text"
                  size="small"
                  onClick={handleWebsiteClick} // event handler
                  startIcon={<LaunchIcon sx={{ fontSize: 14 }} />}
                  sx={{
                    color: "#FF4ECD",
                    textTransform: "none",
                    fontWeight: 600,
                    px: 0,
                    "&:hover": {
                      backgroundColor: "rgba(255, 78, 205, 0.1)", // Hover effect
                    },
                  }}
                >
                  Website
                </Button>
              )}
            </Box>

            {/* Tags */}
            {tagList.length > 0 && (
              <Box 
                sx={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: 1, 
                  mt: 1 
                }}
              >
                {tagList.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    variant="outlined"
                    size="small"
                    sx={{
                      backgroundColor: '#394150',
                      color: '#fff',
                      borderColor: '#ffffff',
                      borderWidth: '0.2px',
                      borderStyle: 'solid',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      letterSpacing: '0.3px',
                      paddingX: '6px',
                      height: '24px',
                    }}
                  />
                ))}
              </Box>
            )}
          </Box>
        </Box>

        {/* Right column - info and plan button */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 1,
            mt: 0.5,
            pt: 2,
            minWidth: 120,
          }}
        >
          {/* Busyness chip, rating, and price */}
          {busynessLabel && (
            <Chip
              icon={<WhatshotIcon sx={{ color: "#fff" }} />}
              label={busynessLabel}
              size="small"
              sx={{
                background: busynessLabel === 'No Data'
                  ? 'linear-gradient(to right, #888, #bbb)'
                  : 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                color: "#fff",
                fontWeight: 600,
                height: 24,
              }}
            />
          )}
          {/* Rating */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, ml: 1 }}>
            {(() => {
              let parsedRating = typeof venue.review === 'string'
                ? parseFloat(venue.review.replace('Rating: ', ''))
                : venue.review;
              return [1, 2, 3, 4, 5].map((i) => {
                if (parsedRating >= i) {
                  return <StarIcon key={i} sx={{ fontSize: 18, color: '#FFD700' }} />;
                } else if (parsedRating >= i - 0.5) {
                  return <StarHalfIcon key={i} sx={{ fontSize: 18, color: '#FFD700' }} />;
                } else {
                  return <StarBorderIcon key={i} sx={{ fontSize: 18, color: '#FFD700' }} />;
                }
              });
            })()}
            <Typography variant="body2" sx={{ color: '#fff', ml: 1 }}>
              {venue.review ? (typeof venue.review === 'string' ? parseFloat(venue.review.replace('Rating: ', '')).toFixed(1) : venue.review.toFixed(1)) : 'N/A'}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: "0.5px" }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <AttachMoneyIcon
                key={i}
                sx={{ fontSize: 16, color: i <= level ? "#FFD700" : "#555555" }}
              />
            ))}
          </Box>

          {!hidePlanButtons && (
            <Button
              onClick={isInPlan ? handleRemoveFromPlan : handleAddToPlan}
              disabled={!isInPlan && isPlanFull}
              variant="outlined"
              size="small"
              sx={{
                textTransform: "none",
                fontWeight: "bold",
                borderRadius: 2,
                borderColor: "#FF4ECD",
                color: "#FF4ECD",
                minWidth: 140,
                minHeight: 32,
                zIndex: 5,
                "&:hover": {
                  background: "linear-gradient(to right, #3ABEFF, #FF4ECD)",
                  color: "#000",
                  borderColor: "transparent",
                },
                "&:disabled": {
                  borderColor: "#555",
                  color: "#555",
                },
                "&:active": {
                  transform: "scale(0.98)",
                },
                transition: "all 0.2s ease",
              }}
            >
              {isInPlan ? "Remove from Plan" : "Add to Plan"}
            </Button>
          )}
        </Box>
      </Card>
    </Box>
  );
}
