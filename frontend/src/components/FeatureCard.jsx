import { Box, Typography } from '@mui/material';

export default function FeatureCard({ iconSrc, title, description }) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 200,
        textAlign: 'center',
        px: { xs: 2, md: 3 },
        py: 4,
        backgroundColor: 'transparent', // No box
        color: '#fff',
      }}
    >
      {/* Icon */}
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

      {/* Description */}
      <Typography
        variant="body2"
        sx={{ color: '#ccc' }}
      >
        {description}
      </Typography>
    </Box>
  );
}


