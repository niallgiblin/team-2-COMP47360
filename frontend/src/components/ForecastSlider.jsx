import { Box, Typography, Slider, Button } from '@mui/material';
import { useState } from 'react';

export default function ForecastSlider({ timestamps = [], selectedTimestamp, onChange }) {
  const [mode, setMode] = useState('forecast');

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
      {/* Toggle */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mb: 2,
        }}
      >
        <Typography sx={{ color: '#fff' }}>Mode:</Typography>

        <Button
          onClick={() => setMode('live')}
          sx={{
            fontWeight: 'bold',
            textTransform: 'uppercase',
            color: mode === 'live' ? '#000' : '#FFFFFF',
            background:
              mode === 'live'
                ? 'linear-gradient(to right, #3ABEFF, #FF4ECD)'
                : 'transparent',
            border: '1px solid #FF4ECD',
            px: 2,
            '&:hover': {
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
              color: '#000',
            },
          }}
        >
          Live
        </Button>

        <Button
          onClick={() => setMode('forecast')}
          sx={{
            fontWeight: 'bold',
            textTransform: 'uppercase',
            color: mode === 'forecast' ? '#000' : '#FFFFFF',
            background:
              mode === 'forecast'
                ? 'linear-gradient(to right, #3ABEFF, #FF4ECD)'
                : 'transparent',
            border: '1px solid #FF4ECD',
            px: 2,
            '&:hover': {
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
              color: '#000',
            },
          }}
        >
          Forecast
        </Button>
      </Box>

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
