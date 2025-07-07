import { Box, Typography, Chip, Button, Card, CardMedia, Tooltip } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
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
  
  // Handle both string and numeric price values
  let level = 0;
  if (typeof venue.price === 'number') {
    level = venue.price;
  } else if (typeof venue.price === 'string') {
    const normalizedPrice = venue.price.trim().toLowerCase();
    level = priceLevels[normalizedPrice] || 0;
  }

  // Debug logging
  console.log('Venue:', venue.name);
  console.log('Raw price:', venue.price);
  console.log('Price type:', typeof venue.price);
  console.log('Mapped level:', level);
  console.log('---');

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
        color: '#fff',
        backgroundColor: '#222',
        boxSizing: 'border-box',
        p: variant === 'compact' ? 1 : variant === 'map' ? 1.5 : 2,
        width: variant === 'compact' ? 200 : '100%',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        height: variant === 'compact' ? 320 : 'auto', // Increased height for compact
    }}
    >

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
            alignItems: 'center',
            gap: 8,
            mt: 1,
            }}
        >
            {/* Rating */}
            <Box 
                sx={{ 
                    display: 'flex', 
                    alignItems: 'center' }}>
            <StarIcon 
                sx={{ 
                    color: '#FFD700', 
                    fontSize: 18, 
                    mr: 0.5 
                }} 
            />
            <Typography variant="body2" sx={{ color: '#fff' }}>
                {venue.rating}
            </Typography>
            </Box>

            {/* Price */}
            <Box 
                sx={{ 
                    display: 'flex', 
                    gap: '0.5px' 
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

        {/* Add/Remove Button */}
        <Box 
            sx={{ 
                display: 'flex', 
                justifyContent: 'center', 
                mt: variant === 'compact' ? 1 : 2,
                mb: variant === 'compact' ? 1.5 : 1, 
            }}>
            
            <Tooltip
            title={
                !isInPlan && isPlanFull
                ? 'You can only add up to 3 venues to your plan.'
                : ''
            }
            arrow
            placement="top"
            >
            <span>
                <Button
                onClick={() =>
                    isInPlan ? removeFromPlan(venue.id) : addToPlan(venue)
                }
                disabled={!isInPlan && isPlanFull}
                variant="contained"
                sx={{
                    background: isInPlan
                    ? 'linear-gradient(to right, #FF4ECD, #3ABEFF)'
                    : 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                    color: '#000',
                    fontWeight: 'bold',
                    textTransform: 'none',
                    px: variant === 'compact' ? 2 : variant === 'map' ? 3 : 4,
                    py: variant === 'compact' ? 0.3 : variant === 'map' ? 1 : 1.5,
                    fontSize:
                    variant === 'compact'
                        ? '0.8rem'
                        : variant === 'map'
                        ? '0.9rem'
                        : '1rem',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                    '&:hover': {
                    background: isInPlan
                        ? 'linear-gradient(to right, #FF6EDB, #5F3AFF)'
                        : 'linear-gradient(to right, #5F3AFF, #FF6EDB)',
                    },
                }}
                >
                {isInPlan ? 'Remove from Plan' : 'Add to Plan'}
                </Button>
            </span>
            </Tooltip>
        </Box>
        </Box>
    </Card>
  );
}