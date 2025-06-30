import { Box, Typography, Slider, Button } from '@mui/material';
import { useState } from 'react';

export default function ForecastSlider({ timestamps = [], selectedTimestamp, onChange, mode }) {

  if (!timestamps.length) return null;

  const currentIndex = timestamps.findIndex(ts => ts === selectedTimestamp);

  return (
    <Box
      sx={{
        px: 2,
        py: 2,
        backgroundColor: '#000',
        mt: 0.2,
      }}
    >


      {/* Prediction slider */}
      {mode === 'forecast' && (
        <Box>
          <Typography sx={{ color: '#fff', mb: 1 }}>
            Forecast for: {new Date(selectedTimestamp).toLocaleString()}
          </Typography>

          <Slider
            value={currentIndex}
            min={0}
            max={timestamps.length - 1}
            step={1}
            onChange={(e, index) => onChange(timestamps[index])}
            marks
            sx={{
              height: 8,
              '& .MuiSlider-thumb': {
                width: 18,
                height: 18,
                backgroundColor: '#FF4ECD',
                border: '2px solid #fff',
              },
              '& .MuiSlider-track': {
                background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                border: 'none',
              },
              '& .MuiSlider-rail': {
                backgroundColor: '#555',
                opacity: 0.6,
              },
              '& .MuiSlider-mark': {
                backgroundColor: '#ccc',
                height: 6,
                width: 2,
              },
              '& .MuiSlider-markActive': {
                opacity: 1,
                backgroundColor: '#fff',
              },
            }}
          />
        </Box>
      )}
    </Box>
  );
}
