// right-hand drawer that displays directions for walking or transit
// used in the MapView page

import { Drawer, Box, Typography, IconButton, Divider } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { ToggleButtonGroup, ToggleButton } from '@mui/material';

export default function DirectionsSidebar({ open, onClose, directions, travelMode, setTravelMode }) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      variant="temporary"
      ModalProps={{ keepMounted: false }}
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
          display: 'flex',
          flexDirection: 'column',
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
        value={travelMode}
        exclusive
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

      {/* Scrollable Directions Container */}
      <Box sx={{ 
        flex: 1, 
        overflowY: 'auto',
        pr: 1,
        pb: 3, // Add bottom padding to ensure content isn't cut off
        '&::-webkit-scrollbar': {
          width: '6px',
        },
        '&::-webkit-scrollbar-track': {
          background: '#222',
        },
        '&::-webkit-scrollbar-thumb': {
          background: '#FF4ECD',
          borderRadius: '3px',
        },
        '&::-webkit-scrollbar-thumb:hover': {
          background: '#FF6ECD',
        },
      }}>
        {!directions || directions.length === 0 ? (
          <Typography 
            sx={{ 
              color: '#888' 
            }}
          >
            No directions available.
          </Typography>
        ) : (
          <Box>
            {/* Group steps by leg */}
            {directions.map((step, index) => {
              const isTransit = step.transitDetails?.line;
              const isLegStart = step.legIndex !== undefined && (index === 0 || directions[index - 1]?.legIndex !== step.legIndex);

              return (
                <Box key={index}>
                  {/* Leg title */}
                  {isLegStart && (
                    <Typography 
                      variant="h6" 
                      sx={{ 
                        fontWeight: 'bold', 
                        color: '#3ABEFF',
                        mb: 1,
                        mt: index > 0 ? 3 : 0
                      }}
                    >
                      {step.legStartLocation?.name || `Leg ${step.legIndex + 1}`} → {step.legEndLocation?.name || 'Destination'}
                    </Typography>
                  )}

                  {/* Step with bullet point */}
                  <Box sx={{ mb: 1.5, pl: 2 }}>
                    <Typography 
                      variant="body1" 
                      sx={{ 
                        color: '#FFFFFF',
                        lineHeight: 1.6,
                        position: 'relative',
                        '&::before': {
                          content: '"•"',
                          color: '#FF4ECD',
                          position: 'absolute',
                          left: '-12px',
                          fontWeight: 'bold'
                        }
                      }}
                    >
                      {isTransit ? (
                        <>
                          Take <strong>{step.transitDetails?.line?.shortName || 'Transit'}</strong> (
                          {step.transitDetails?.line?.vehicle?.type || 'Transit'}) toward{' '}
                          <strong>{step.transitDetails?.headsign || 'destination'}</strong> from{' '}
                          <strong>{step.transitDetails?.departureStop?.name || 'departure'}</strong> to{' '}
                          <strong>{step.transitDetails?.arrivalStop?.name || 'arrival'}</strong>.
                        </>
                      ) : (
                        step.instructions || 'Continue on route'
                      )}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Drawer>
  );
} 