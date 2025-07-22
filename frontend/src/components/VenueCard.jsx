// Card component to display venue's image, rating, price level and link to website
// less detail than trending venue card, to give a compact idea of the venue
// used in PlanSummary, PlanDisplay, FindMyVibe, MapView, Profile 

import { Box, Typography, Chip, Button, Card, CardMedia, Tooltip } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import StarHalfIcon from '@mui/icons-material/StarHalf';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import LaunchIcon from '@mui/icons-material/Launch';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import { getCategory, categoryImages } from '../utils/tagMapping';
import { Favorite as FavoriteIcon } from '@mui/icons-material';

import { usePlan } from '../context/PlanContext';


// Functional component that displays information about a venue and handles actions
export default function VenueCard({ venue, variant = 'default', disableActions = false, showLikeButton = false, onLike, highlighted = false }) {
  const { plan, addToPlan, removeFromPlan } = usePlan();
  try {
    console.log('VenueCard venue:', venue);
    if (!venue) return null; // Defensive: render nothing if venue is missing

    // Destructure venue object with fallbacks to prevent crashes
    const {
      id = '',
      name = 'Unknown Venue',
      lat = 0,
      lng = 0,
      review,
      rating,
      price,
      tags = [],
      imageUrl: rawImageUrl = '',
      description = '',
      uri = ''
    } = venue;

    // Parse rating from either 'review' or 'rating' field
    let parsedRating = 0;
    if (typeof review === 'string') {
      const match = review.match(/([0-9.]+)/);
      parsedRating = match ? parseFloat(match[1]) : 0;
    } else if (typeof review === 'number') {
      parsedRating = review;
    } else if (typeof rating === 'number') {
      parsedRating = rating;
    }

    // Normalize price to 1-5 level
    const priceLevels = {
      'price level very cheap': 1,
      'price level cheap': 2,
      'price level moderate': 3,
      'price level expensive': 4,
      'price level very expensive': 5,
    };

    let level = 0;
    if (typeof price === 'number') {
      level = price;
    } else if (typeof price === 'string') {
      const normalizedPrice = price.trim().toLowerCase();
      level = priceLevels[normalizedPrice] || 0;
    }

    // Pick fallback image based on category
    const category = getCategory(description || '');
    const imageUrlFinal = rawImageUrl || categoryImages[category] || categoryImages.default;

    // Handle "Visit Website" click
    const handleWebsiteClick = () => {
      if (uri) {
        window.open(uri, '_blank');
      }
    };

    // Determine if venue is in the current plan and if the plan is full
    const isInPlan = Array.isArray(plan) ? plan.some(v => v.id === id) : false;
    const isPlanFull = Array.isArray(plan) ? plan.length >= 5 : false;

    return (
      <Card
      sx={{
          position: 'relative',
          overflow: 'visible',
          color: '#fff',
          backgroundColor: '#222',
          boxSizing: 'border-box',
          p: variant === 'compact' ? '18px 8px 8px 8px' : variant === 'map' ? 1.5 : 2, // extra top padding for heart
          minWidth: variant === 'compact' ? 200 : undefined,
          maxWidth: variant === 'compact' ? 220 : undefined,
          width: variant === 'compact' ? 200 : '100%',
          flex: variant === 'compact' ? '0 0 auto' : undefined,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          height: variant === 'compact' ? 300 : 'auto', // Increased height for compact
          border: highlighted ? '2.5px solid #FF4ECD' : undefined,
          boxShadow: highlighted ? '0 0 0 4px rgba(255,78,205,0.10)' : undefined,
      }}
      >
        {/* Like (heart) button for Favourites tab */}
        {showLikeButton && (
          <Box sx={{ position: 'absolute', top: 2, right: 8, zIndex: 10 }}>
            <Tooltip title="Remove from Favourites" arrow>
              <Button
                onClick={onLike}
                sx={{
                  minWidth: 0,
                  width: 32,
                  height: 32,
                  padding: 0,
                  background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                  color: '#fff',
                  borderRadius: '50%',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  '&:hover': {
                    background: 'linear-gradient(to right, #FF4ECD, #3ABEFF)',
                  },
                }}
              >
                <FavoriteIcon sx={{ fontSize: 18 }} />
              </Button>
            </Tooltip>
          </Box>
        )}

        {/* remove from plan x button */}
        {!disableActions && isInPlan && !showLikeButton && (
        <Box sx={{ position: 'absolute', top: -12, right: -4, zIndex: 2 }}>
          <Tooltip title="Remove from Plan" arrow>
            <Button
              onClick={() => removeFromPlan(id)}
              sx={{
                minWidth: 0,
                width: 32,
                height: 32,
                padding: 0,
                background: 'linear-gradient(to right, #FF4ECD, #3ABEFF)',
                color: '#fff',
                fontSize: '1.5rem',
                lineHeight: 1,
                fontWeight: 'bold',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                '&:hover': {
                  backgroundColor: 'rgba(0,0,0,0.9)',
                },
              }}
            >
              ×
            </Button>
          </Tooltip>

        </Box>
        )}

        {/* Display the venue's image using CardMedia */}
        <CardMedia
          component="img"
          image={imageUrlFinal}
          alt={name}
          sx={{ 
              borderRadius: 2, 
              mb: variant === 'compact' ? 1 : variant === 'map' ? 1 : 2,
              height: variant === 'compact'
                ? 100
                : variant === 'map'
                ? 120
                : { xs: '140px', md: '200px' },
              objectFit: 'cover',
              width: '100%',
          }}
        />
        
        {/* Display the venue's name as a heading */}
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, mt: 1 }}>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 'bold', color: '#fff', mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {name}
          </Typography>
          {/* Add flexible spacer between name and rating if highlighted */}
          {highlighted && <Box sx={{ flexGrow: 1 }} />}
          {/* Rating */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            {[1, 2, 3, 4, 5].map((i) => {
              if (parsedRating >= i) {
                return <StarIcon key={i} sx={{ fontSize: 18, color: '#FFD700' }} />;
              } else if (parsedRating >= i - 0.5) {
                return <StarHalfIcon key={i} sx={{ fontSize: 18, color: '#FFD700' }} />;
              } else {
                return <StarBorderIcon key={i} sx={{ fontSize: 18, color: '#FFD700' }} />;
              }
            })}
            <Typography variant="body2" sx={{ color: '#fff', ml: 1 }}>
              {parsedRating ? parsedRating.toFixed(1) : 'N/A'}
            </Typography>
          </Box>
          {/* Price */}
          <Box 
              sx={{ 
                display: 'flex', 
                alignItems: 'center',
                gap: '0.25rem',
                mt: 0.5,
              }}>
          {[1, 2, 3, 4, 5].map((i) => (
              <AttachMoneyIcon
              key={i}
              sx={{
                  fontSize: 16,
                  color: i <= level ? '#FFD700' : '#555555',
              }}
              />
          ))}
          </Box>
        </Box>

        {/* Website link: hide if showLikeButton and content is too tall */}
        {uri && (!showLikeButton || (showLikeButton && !isPlanFull)) && (
          <Box sx={{ mt: 1 }}>
            <Button
              variant="text"
              size="small"
              onClick={handleWebsiteClick}
              startIcon={<LaunchIcon sx={{ fontSize: 14 }} />}
              sx={{
                color: '#FF4ECD',
                textTransform: 'none',
                fontWeight: 600,
                px: 0,
              }}
            >
              Visit Website
            </Button>
          </Box>
        )}
        {!disableActions && (
          <Box sx={{ mt: 'auto', pt: 1 }}>
            <Tooltip title={
              isInPlan
                ? "Already in your plan"
                : isPlanFull
                ? "Your plan is full (max 5 venues)"
                : ""
            } arrow>
              {/* The Tooltip needs a span wrapper to work when the button is disabled */}
              <span>
                <Button
                  variant="contained"
                  size={showLikeButton ? "medium" : "small"}
                  fullWidth
                  onClick={() => {
                    if (!isPlanFull && !isInPlan && addToPlan) {
                      addToPlan({ id, name, lat, lng, review: parsedRating, rating: parsedRating, price: level, tags, imageUrl: imageUrlFinal, description, uri });
                    }
                  }}
                  disabled={isPlanFull || isInPlan}
                  sx={{
                    background: showLikeButton ? 'linear-gradient(90deg, #3ABEFF 0%, #FF4ECD 100%)' : 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                    fontWeight: 'bold',
                    color: showLikeButton ? '#000' : '#121212',
                    fontSize: showLikeButton ? '1.1rem' : undefined,
                    py: showLikeButton ? 1.2 : undefined,
                    borderRadius: showLikeButton ? 2 : undefined,
                    boxShadow: showLikeButton ? '0 2px 8px rgba(58,190,255,0.10)' : undefined,
                    letterSpacing: showLikeButton ? '0.03em' : undefined,
                    '&:disabled': {
                      background: '#555',
                      color: '#888',
                      cursor: 'not-allowed'
                    }
                  }}
                >
                  Add to Plan
                </Button>
              </span>
            </Tooltip>
          </Box>
        )}
      </Card>
    );
  } catch (err) {
    console.error('VenueCard render error:', err, venue);
    return (
      <div style={{ color: 'red', padding: 8 }}>
        Error rendering venue card. See console for details.
      </div>
    );
  }
}