import { useState } from 'react';
import {
    Card,
    CardMedia,
    Typography,
    Box,
    Button,
    Chip,
    IconButton,
} from '@mui/material';

import { useNavigate } from 'react-router-dom';
import { usePlan } from '../context/PlanContext';
import { categoryImages } from '../utils/tagMapping';
import { Favorite as FavoriteIcon, FavoriteBorder as FavoriteBorderIcon, Whatshot as WhatshotIcon, AttachMoney as AttachMoneyIcon, Launch as LaunchIcon } from '@mui/icons-material';


export default function TrendingVenueCard({ venue, busynessMap = [] }) {
    const [liked, setLiked] = useState(false);
    const { setSelectedVenue, setFromPlan } = usePlan();
    const navigate = useNavigate();


    const priceLevels = {
        'price level very cheap': 1,
        'price level cheap': 2,
        'price level moderate': 3,
        'price level expensive': 4,
        'price level very expensive': 5,
    };
    

    let level = 0;
    if (typeof venue.price === 'number') {
        level = venue.price;
    } else if (typeof venue.price === 'string') {
        const normalizedPrice = venue.price.trim().toLowerCase();
        level = priceLevels[normalizedPrice] || 0;
    }

    const { plan, addToPlan, removeFromPlan } = usePlan();
    const isInPlan = plan.some((v) => v.id === venue.id);
    const isPlanFull = plan.length >= 3;

    const getCategoryFromFlags = (venue) => {
        if (venue.isRestaurant) return 'restaurant';
        if (venue.isBar) return 'bar';
        if (venue.isClub) return 'club';
        if (venue.isLandmark) return 'landmark';
        return 'other';
        };

    const category = getCategoryFromFlags(venue);

    // description truncation state
    const [showFull, setShowFull] = useState(false);
    const descriptionText = venue.summary || venue.description || '';
    const isLong = descriptionText.length > 100;
    const displayedText = showFull ? descriptionText : `${descriptionText.slice(0, 100)}${isLong ? '...' : ''}`;


    const imageUrl = venue.imageUrl || categoryImages[category] || categoryImages.default;
    

    const handleWebsiteClick = () => {
        if (venue.uri) {
            window.open(venue.uri, '_blank');
        }
    };

    // function to get busyness data (based on zone)
    const getBusynessLabel = () => {
        if (!venue.zone || venue.zone === 'nan') return null;

        const zoneKey = String(venue.zoneId);
        const value = busynessMap[zoneKey];

        console.warn("Zone:", zoneKey, "→ busyness:", value);

        if (typeof value !== 'number') return null;

        const percent = value * 100;
        if (percent >= 75) return 'Very Busy';
        if (percent >= 50) return 'Busy';
        if (percent >= 25) return 'Moderate';
        return 'Quiet';
    };

    return (
        <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center', mt: 4 }}>
        
        {/* Heart icon */}
        <IconButton
            onClick={() => setLiked(!liked)}
            sx={{
                position: 'absolute',
                top: -12, // Half in/out
                right: 12,
                zIndex: 2,
                background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                color: '#fff',
                width: 32,
                height: 32,
                padding: 0,
                borderRadius: '50%',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                '&:hover': {
                background: 'linear-gradient(to right, #FF4ECD, #3ABEFF)',
                },
            }}
            >
            {liked ? (
                <FavoriteIcon sx={{ fontSize: 18 }} />
            ) : (
                <FavoriteBorderIcon sx={{ fontSize: 18 }} />
            )}
            </IconButton>

  <Card
    sx={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 2,
      p: 2,
      mb: 3,
      backgroundColor: '#1a1a1a',
      borderRadius: 3,
      color: '#fff',
      boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
      width: '100%',
      maxWidth: 600,
      minHeight: 120, // Ensures consistent height
      position: 'relative', // For positioning heart icon inside
    }}
  >

    {/* Left section */}
    <Box 
        sx={{ 
            display: 'flex', 
            gap: 2, 
            flex: 1, 
            minWidth: 0 }}>
      <CardMedia
        component="img"
        image={imageUrl}
        alt={venue.name}
        sx={{
          width: 80,
          height: 80,
          borderRadius: 2,
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />

      {/* Text content */}
      <Box 
        sx={{ 
            flexGrow: 1, 
            minWidth: 0 
        }}
    >
        <Box 
            sx={{ 
                display: 'flex',
                alignItems: 'baseline',
                gap: 1,
                flexWrap: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}
        >
          <Typography 
            variant="subtitle1" 
            sx={{ 
                fontWeight: 'bold', 
                color: '#fff' 
            }}
        >
            {venue.name}
          </Typography>
          
          <Typography 
            variant="subtitle1" 
            sx={{ 
                fontWeight: 'bold',
                color: '#ccc',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '80%', 
            }}
        >
            · {category.charAt(0).toUpperCase() + category.slice(1)} · {venue.zone && venue.zone !== 'nan' ? venue.zone : 'Manhattan'}
          </Typography>
        </Box>

        {/* Description with Read More */}
        <Typography 
            variant="body2" 
            sx={{ 
                color: '#aaa', 
                mb: 1,
                display: '-webkit-box',
                WebkitLineClamp: showFull ? 'unset' : 2, // limits the description to 2 lines
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis', 
            }}
        >
          {displayedText}
          {isLong && (
            <Button
              onClick={() => setShowFull(!showFull)}
              size="small"
              sx={{
                color: '#3ABEFF',
                textTransform: 'none',
                fontWeight: 500,
                ml: 1,
                p: 0,
                minWidth: 'auto',
              }}
            >
              {showFull ? 'Show less' : 'Read more'}
            </Button>
          )}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="text"
            size="small"
            onClick={() => {
              setSelectedVenue(venue);
              setFromPlan(false);
              navigate('/map');
            }}
            sx={{
              color: '#3ABEFF',
              textTransform: 'none',
              fontWeight: 600,
              px: 0,
            }}
          >
            View on Map
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
    </Box>

    {/* Right section */}
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 1,
        mt: 0.5,
        pt: 2,
        minWidth: 120,
      }}
    >
      {getBusynessLabel() && (
        <Chip
          icon={<WhatshotIcon sx={{ color: '#fff' }} />}
          label={getBusynessLabel()}
          size="small"
          sx={{
            background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
            color: '#fff',
            fontWeight: 600,
            height: 24,
          }}
        />
      )}
      <Box sx={{ display: 'flex', gap: '0.5px' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <AttachMoneyIcon
            key={i}
            sx={{ fontSize: 16, color: i <= level ? '#FFD700' : '#555555' }}
          />
        ))}
      </Box>

      <Button
        onClick={() =>
          isInPlan ? removeFromPlan(venue.id) : addToPlan(venue)
        }
        disabled={!isInPlan && isPlanFull}
        variant="outlined"
        size="small"
        sx={{
          textTransform: 'none',
          fontWeight: 'bold',
          borderRadius: 2,
          borderColor: '#FF4ECD',
          color: '#FF4ECD',
          minWidth: 140,
          minHeight: 32,
          '&:hover': {
            background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
            color: '#000',
          },
        }}
      >
        {isInPlan ? 'Remove from Plan' : 'Add to Plan'}
      </Button>
    </Box>
  </Card>
</Box>

    );
}
