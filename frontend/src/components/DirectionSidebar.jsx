// right-hand drawer that displays directions for walking or transit
// used in the MapView page

import { Drawer, Box, Typography, IconButton, Divider } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { ToggleButtonGroup, ToggleButton } from '@mui/material';

// sidebar component for displaying directions
export default function DirectionsSidebar({ open, onClose, directions, travelMode, setTravelMode }) {
  return (
    <Drawer
      anchor="right"              // sidebar slides in from the right
      open={open}
      onClose={onClose}
      hideBackdrop                // prevent dark overlay
      variant="persistent"        // keeps the drawer open until user closes it
      sx={{
        '& .MuiDrawer-paper': {
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: 320,
          backgroundColor: '#111',
          color: '#fff',
          boxShadow: '-2px 0 8px rgba(0,0,0,0.4)',
          p: 3,
        },
      }}
    >
      {/* Header */}
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          mb: 2 
        }}
      >
        
        <Typography 
          variant="h6" 
          sx={{ 
            fontWeight: 'bold' 
          }}
        >
          Directions
        </Typography>
        
        {/* Close button x */}
        <IconButton 
          onClick={onClose} 
          size="small" 
          sx={{ 
            color: '#FF4ECD' 
          }}
        >
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Travel Mode Toggle */}
      <ToggleButtonGroup
        value={travelMode}            // current mode
        exclusive                     // only one mode can be active at a time
        onChange={(e, mode) => mode && setTravelMode(mode)}
        size="small"
        sx={{
          mb: 2,
          backgroundColor: '#222',
          borderRadius: 2,
          '& .MuiToggleButton-root': {
            color: '#ccc',
            borderColor: '#444',
            width: '100%',
            px: 2, 
            py: 1,
            '&.Mui-selected': {
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
              color: '#000',
              fontWeight: 'bold',
            },
          },
        }}
      >
        <ToggleButton value="WALK">
          Walk
        </ToggleButton>
        
        <ToggleButton value="TRANSIT">
          Transit
        </ToggleButton>

      </ToggleButtonGroup>

      <Divider 
        sx={{ 
          borderColor: '#333', 
          mb: 2 
        }} 
      />

      {/* Steps */}
      {!directions || directions.length === 0 ? (
        <Typography 
          sx={{ 
            color: '#888' 
          }}
        >
          No directions available.
        </Typography>
      ) : (
        directions.map((step, index) => {
          const isTransit = step.transitDetails?.line;

          return (
            <Box 
              key={index} 
              sx={{ mb: 2 }}>
              
              {/* Summary title*/}
              <Typography variant="subtitle1" 
                sx={{ 
                  fontWeight: 'bold', 
                  color: '#FFF', 
                }}
              >
                {step.summary}
              </Typography>

              {/* Instruction details */}
              <Typography 
                variant="body1" 
                sx={{ 
                  color: '#aaa' ,
                  lineHeight: 1.6,
                }}
              >
                {isTransit ? (
                  <>
                    Take <strong>{step.transitDetails.line.shortName}</strong> (
                    {step.transitDetails.line.vehicle?.type || 'Transit'}) toward{' '}
                    <strong>{step.transitDetails.headsign}</strong> from{' '}
                    <strong>{step.transitDetails.departureStop.name}</strong> to{' '}
                    <strong>{step.transitDetails.arrivalStop.name}</strong>.
                  </>
                ) : (
                  step.instructions
                )}
              </Typography>
            </Box>
          );
        })
      )}
    </Drawer>
  );
}

