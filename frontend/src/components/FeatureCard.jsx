import { Box, Typography } from '@mui/material';

export default function FeatureCard({ title, description }) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 250,
        textAlign: 'center',
        padding: 3,
        backgroundColor: '#fff',
        borderRadius: 2,
        boxShadow: 3,
        mx: 2,
      }}
    >
      <Box
        sx={{
          width: 60,
          height: 60,
          backgroundColor: '#ccc',
          borderRadius: 1,
          margin: '0 auto 1rem',
        }}
      />
      <Typography variant="h6" fontWeight="bold" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
    </Box>
  );
}
