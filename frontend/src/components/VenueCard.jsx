import { Box, Typography, Chip, Button, Card, CardMedia, Tooltip } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import StarHalfIcon from '@mui/icons-material/StarHalf';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import LaunchIcon from '@mui/icons-material/Launch';
import { getCategory, categoryImages } from '../utils/tagMapping';

import { usePlan } from '../context/PlanContext';

// Functional component that displays information about a venue
export default function VenueCard({ venue, variant = 'default' }) {
  const { plan, addToPlan, removeFromPlan } = usePlan();  
  if (!venue) return null; // return nothing if the venue is not provided
  const isInPlan = plan.some(v => v.id === venue.id);
  const isPlanFull = plan.length >= 3;

  const priceLevels = {
    'price level very cheap': 1,
    'price level cheap': 2,
    'price level moderate': 3,
    'price level expensive': 4,
    'price level very expensive': 5,
  };

  // Rating
  const parsedRating = typeof venue.review === 'string'
    ? parseFloat(venue.rating.replace('Rating: ', ''))
    : venue.review;

  
  // Handle both string and numeric price values
  let level = 0;
  if (typeof venue.price === 'number') {
    level = venue.price;
  } else if (typeof venue.price === 'string') {
    const normalizedPrice = venue.price.trim().toLowerCase();
    level = priceLevels[normalizedPrice] || 0;
  }

  const category = getCategory(venue.description || '');
  const imageUrl = venue.imageUrl || categoryImages[category] || categoryImages.default;

  const handleWebsiteClick = () => {
    if (venue.uri) {
      window.open(venue.uri, '_blank');
    }
  };

  return (
    <Card
    sx={{
        position: 'relative',
        overflow: 'visible',
        color: '#fff',
        backgroundColor: '#222',
        boxSizing: 'border-box',
        p: variant === 'compact' ? 1 : variant === 'map' ? 1.5 : 2,
        width: variant === 'compact' ? 200 : '100%',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        height: variant === 'compact' ? 300 : 'auto', // Increased height for compact
    }}
    >

      {/* remove from plan x button */}
      {isInPlan && (
      <Box sx={{ position: 'absolute', top: -12, right: -4, zIndex: 2 }}>
        <Tooltip title="Remove from Plan" arrow>
          <Button
            onClick={() => removeFromPlan(venue.id)}
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
        image={imageUrl}
        alt={venue.name}
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
      <Typography 
        variant="h6" 
        sx={{ 
          fontSize: '1.25rem',
          lineHeight: variant === 'compact' ? 1.3 : 1.6,
          mb: variant === 'compact' ? 'auto' : 0,
          flexGrow: variant === 'compact' ? 1 : 0,
        }}
      >
        {venue.name}
      </Typography>
      
      {/* Display the price level and rating */}
        <Box sx={{ mt: variant === 'compact' ? 0 : 'auto' }}>
        
        {/* Rating and price */}
        <Box
            sx={{
              display: 'flex',
              flexDirection: variant === 'compact' ? 'column' : 'row',
              alignItems: variant === 'compact' ? 'flex-start' : 'center',
              gap: variant === 'compact' ? 0.5 : 5,
              mt: 1,
            }}
        >
            {/* Rating */}
            <Box 
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 0.25 
              }}
            >
              {[1, 2, 3, 4, 5].map((i) => {
                if (parsedRating >= i) {
                  return <StarIcon 
                            key={i} 
                            sx={{ 
                              fontSize: 18, 
                              color: '#FFD700' 
                            }} 
                          />;
                } else if (parsedRating >= i - 0.5) {
                  return <StarHalfIcon 
                            key={i} 
                            sx={{ 
                              fontSize: 18, 
                              color: '#FFD700' 
                            }} 
                          />;
                } else {
                  return <StarBorderIcon 
                          key={i} 
                          sx={{ 
                            fontSize: 18, 
                            color: '#FFD700' 
                          }} 
                        />;
                }
              })}
              <Typography 
                variant="body2" 
                sx={{ 
                  color: '#fff', 
                  ml: 1 
                }}
              >
                {parsedRating ? parsedRating.toFixed(1) : 'N/A'}
              </Typography>
            </Box>



            {/* Price */}
            <Box 
                sx={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  gap: '0.25rem',
                  mt: variant === 'compact' ? 0.5 : 0,
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

        {/* Tags */}
        <Box
            sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            mt: 1,
            }}
        >
            {(venue.tags || []).map((tag) => (
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

        {/* Website link */}
        {venue.uri && (
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
        </Box>
    </Card>
  );
}