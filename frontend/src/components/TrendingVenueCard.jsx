import { Card, CardMedia, Typography, Box, Button, Chip } from '@mui/material';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import LaunchIcon from '@mui/icons-material/Launch';
import { usePlan } from '../context/PlanContext';
import { getCategory, categoryImages } from '../utils/tagMapping';

export default function TrendingVenueCard({ venue, onGetDirections }) {
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
  console.log('Level:', level);
  console.log('---');

  const { plan, addToPlan, removeFromPlan } = usePlan();
  const isInPlan = plan.some(v => v.id === venue.id);
  const isPlanFull = plan.length >= 3;

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
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        mb: 3,
        backgroundColor: '#1a1a1a',
        borderRadius: 3,
        color: '#fff',
        boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
        maxWidth: 600,
        mx: 'auto',
      }}
    >
      {/* Venue Image */}
      <CardMedia
        component="img"
        image={imageUrl}
        alt={venue.name}
        sx={{
          width: 80,
          height: 80,
          borderRadius: 2,
          objectFit: 'cover',
        }}
      />

      {/* Venue Details */}
      <Box 
        sx={{ 
            flexGrow: 1, 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 2
            }}
        >
        
        {/* Left: Name and Category */}
        <Box 
            sx={{ 
                mt: 0.5 
                }}
        >
          <Typography variant="subtitle1" 
            sx={{ 
                fontWeight: 'bold', 
                mb: 0.5 }}>
            {venue.name}
          </Typography>
          
          <Typography variant="body2" 
            sx={{ 
                color: '#aaa', 
                mb: 0.5 
                }}
            >
            {venue.category || 'Bar'} · {venue.neighborhood || 'NYC'}
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="text"
              size="small"
              onClick={() => onGetDirections(venue)}
              sx={{
                color: '#3ABEFF',
                textTransform: 'none',
                fontWeight: 600,
                px: 0,
              }}
            >
              Get Directions
            </Button>
            
            {venue.uri && (
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
                Website
              </Button>
            )}
          </Box>
        </Box>

        {/* Right: Trending chip and price icons */}
        <Box 
            sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'flex-start', 
                gap: 1, 
                mt: 0.5 
                }}
            >
          <Chip
            icon={<WhatshotIcon 
                sx={{ 
                    color: '#fff' 
                }} 
                />}
            label="Trending"
            size="small"
            sx={{
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
              color: '#fff',
              fontWeight: 600,
              height: 24,
            }}
          />
          
          {/* Money icons */}
          <Box 
            sx={{ 
                display: 'flex', 
                gap: '0.5px' // gap between each money icon 
                }}
            >
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
          
          {/* Add to plan button */}
          <Button
            onClick={() => isInPlan ? removeFromPlan(venue.id) : addToPlan(venue)}
            disabled={!isInPlan && isPlanFull}
            variant="outlined"
            size="small"
            sx={{
              mt: 1,
              textTransform: 'none',
              fontWeight: 'bold',
              borderRadius: 2,
              borderColor: '#FF4ECD',
              color: '#FF4ECD',
              '&:hover': {
                background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                color: '#000',
              },
            }}
          >
            {isInPlan ? 'Remove from Plan' : 'Add to Plan'}
          </Button>
        </Box>
      </Box>
    </Card>
  );
}