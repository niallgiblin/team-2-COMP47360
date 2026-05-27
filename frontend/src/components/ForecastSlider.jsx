// displays a horizontal time slider to navigate forecast busyness timestamps
// used in the MapView.jsx page
import React from 'react';
import { Box, Typography, Slider, Button } from '@mui/material';
import { DateTime } from "luxon";         // used to format timestamps

export default function ForecastSlider({ timestamps = [], selectedTimestamp, onChange, mode, onInteractionStart, onInteractionEnd }) {

  if (!timestamps.length || !selectedTimestamp) return null;

  const currentIndex = timestamps.findIndex((ts) => {
    if (ts === selectedTimestamp) return true;
    try {
      return DateTime.fromISO(ts).toMillis() === DateTime.fromISO(selectedTimestamp).toMillis();
    } catch {
      return false;
    }
  });

  return (
    <Box
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
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
          {/* Always show the time on the slider in NYC time */}
          <Typography 
            sx={{ 
              color: '#fff', 
              mb: 1 
            }}
          >
            Forecast for: {DateTime.fromISO(selectedTimestamp).setZone("America/New_York").toLocaleString(DateTime.DATETIME_MED)}
          </Typography>

          {/* Slider component */}
          <Slider
            value={currentIndex}
            min={0}
            max={timestamps.length - 1}
            step={1}
            onChange={(e, index) => onChange(timestamps[index])}
            marks
            onMouseDown={(e) => {
              e.stopPropagation();
              onInteractionStart && onInteractionStart();
            }}
            onMouseUp={(e) => {
              e.stopPropagation();
              onInteractionEnd && onInteractionEnd();
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              onInteractionStart && onInteractionStart();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              onInteractionEnd && onInteractionEnd();
            }}
            onClick={(e) => e.stopPropagation()}
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
