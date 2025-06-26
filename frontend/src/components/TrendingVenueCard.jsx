import { Card, CardMedia, Typography, Box, Button, Chip } from '@mui/material';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import { usePlan } from '../context/PlanContext';
import { getCategory, categoryImages } from '../utils/tagMapping';



export default function TrendingVenueCard({ venue, onGetDirections }) {
  const priceLevels = {
    'very cheap': 1,
    'cheap': 2,
    'moderate': 3,
    'expensive': 4,
    'very expensive': 5,
  };
  
  const normalizedPrice = typeof venue.price === 'string' 
  ? venue.price.trim().toLowerCase() 
  : '';

  const level = priceLevels[normalizedPrice] || 0;

  const { plan, addToPlan, removeFromPlan } = usePlan();
  const isInPlan = plan.some(v => v.id === venue.id);
  const isPlanFull = plan.length >= 3;

  const category = getCategory(venue.description || '');
  const imageUrl = venue.imageUrl || categoryImages[category] || categoryImages.default;

  
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


