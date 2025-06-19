import { Box, Typography, Chip, Button, Card, CardMedia } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';

// Functional component that displays information about a venue
export default function VenueCard({ venue }) {
  if (!venue) return null; // return nothing if the venue is not provided

  return (
    // Outer card containner
    <Card 
        sx={{ 
            color: '#fff', 
            backgroundColor: '#222', 
            p: 2,
            boxSizing: 'border-box', 
        }}
    >

      {/* Display the venue's image using CardMedia */}
      <CardMedia
        component="img"
        image={venue.imageUrl || '/default-placeholder.png'}
        alt={venue.name}
        sx={{ 
            borderRadius: 2, 
            mb: 2,
            maxHeight: {xs: '140px', md: '200px'},
            objectFit: 'cover', // keep aspect ratio 
            width: '100%',
        }}
      />
      
      {/* Display the venue's name as a heading */}
      <Typography variant="h6">{venue.name}</Typography>
      
      {/* Display the price level and rating */}
      <Box
        sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            mt: 1,
        }}
        >
     {/* Rating (left side) */}
        <Box 
            sx={{ 
                display: 'flex', 
                alignItems: 'center' 
                }}
        >
            {/* Star icon for rating */}
            <StarIcon 
                sx={{ 
                    color: '#FFD700', 
                    fontSize: 18, 
                    mr: 0.5 
                    }} 
            />
            
            {/* Display numeric rating */}
            <Typography variant="body2" 
                sx={{ 
                    color: '#fff' 
                    }}
            >
                {venue.rating}
            </Typography>
        </Box>

    {/* Price Level (right side) */}
        <Box 
            sx={{ 
                display: 'flex', 
                gap: '0.5px' // gap between each money icon 
                }}
        >
            
            {/* Display 3 money icons, fill them based on price level */}
            {[1, 2, 3, 4, 5].map((i) => (
            <AttachMoneyIcon
                key={i}
                sx={{
                fontSize: 16,  // size of money icons
                color:
                    i <= Number(venue.price) // === 'Low' ? 1 : venue.price === 'Moderate' ? 2 : 3)
                    ? '#FFD700' // filled in gold if part of price level
                    : '#555555', // greyed out if not filled
                }}
            />
            ))}
        </Box>
    </Box>
      
      {/* Display vibe tags */}
      <Box 
        sx={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: 1, 
            mt: 1 
            }}
        >
        {(venue.tags || []).map((tag) => (
          <Chip 
            key={tag} 
            label={tag} 
            variant='outlined'
            size="small"
            sx={{
                backgroundColor: '#394150',
                color: '#fff', // text colour
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
      
      {/* Button to add venue to the user's route */}
    <Box 
        sx={{
            display: 'flex',
            justifyContent: 'center',
            mt: 2
        }}
    >
        <Button variant="contained" 
            sx={{
                background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)', //background colour
                color: '#ffffff', // text colour
                fontWeight: 'bold',
                textTransform: 'none',
                px: 4, // horizontal padding inside the button
                py: 1.5, // vertical padding
                fontSize: '1rem',
                borderRadius: '8px', // rounded corners
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)', //soft shadow
                '&:hover': {
                background: 'linear-gradient(to right, #5F3AFF, #FF6EDB)',
                }
            }}
            >
            Add to Route
        </Button>
    </Box>
    </Card>
  );
}
