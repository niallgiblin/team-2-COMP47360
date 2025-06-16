import { Box, Typography } from '@mui/material';

// Feature Card component
// reusable UI for displaying icon, title and description
export default function FeatureCard({ iconSrc, title, description }) {
  return (
    
    // outer container for the card
    <Box
      sx={{
        flex: 1,                        // allows cards to grow/ shrink evenly
        minWidth: 200,                  // ensures min width for responsive layout
        textAlign: 'center',            // centre-align all child content
        px: { xs: 2, md: 3 },           // horizontal padding
        py: 4,                          // vertical padding
        backgroundColor: 'transparent', // No box
        color: '#fff',                  // default text colour
      }}
    >
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
        gutterBottom              // adds spacing below title
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
    </Box>
  );
}


