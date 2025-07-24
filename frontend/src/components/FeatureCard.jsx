// used on the home page

import { Box, Typography } from '@mui/material';
import { Link } from 'react-router-dom';

// Feature Card component
// reusable UI for displaying icon, title and description
export default function FeatureCard({ iconSrc, title, description, to }) {
  // Shared card content
  const cardContent = (
    <>
      {/* Icon image at top of the card */}
      <Box
        component="img"
        src={iconSrc}
        alt={`${title} icon`}
        sx={{
          width: 48,
          height: 48,
          mb: 2,
        }}
      />

      {/* Title */}
      <Typography
        variant="h6"
        fontWeight="bold"
        gutterBottom
        sx={{ color: '#fff' }}
      >
        {title}
      </Typography>

      {/* Description text */}
      <Typography
        variant="body2"
        sx={{ color: '#ccc' }}
      >
        {description}
      </Typography>
    </>
  );

  // Return either a clickable Link or static Box
  return (
    <Box
      component={to ? Link : 'div'}
      to={to}
      sx={{
        flex: 1,                            // allows cards to grow/ shrink evenly
        minWidth: 200,                      // ensures min width for responsive layout
        textAlign: 'center',                // centre-align all child content
        px: { xs: 2, md: 3 },               // horizontal padding
        py: 4,                             // vertical padding
        backgroundColor: 'transparent',     // No box
        color: '#fff',                      // default text colour
        textDecoration: 'none',
        cursor: to ? 'pointer' : 'default',
        '&:hover': {
          opacity: to ? 0.8 : 1,
        },
      }}
    >
      {cardContent}
    </Box>
  );
}

