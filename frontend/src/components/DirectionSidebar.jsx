import { Drawer, Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export default function DirectionsSidebar({ open, onClose, directions }) {
    return (
      <Drawer 
        anchor="right" 
        open={open} 
        onClose={onClose}
        hideBackdrop
        variant="persistent"
        sx={{
          '& .MuiDrawer-paper': {
            position: 'fixed',
            top: 0,
            right: 0,
            height: '100vh',
            zIndex: 1200,
            pointerEvents: 'auto',
          },
          '& .MuiDrawer-root': {
            pointerEvents: 'none',
          },
          // Ensure the drawer doesn't interfere with map interactions
          pointerEvents: 'none',
        }}
        ModalProps={{
          // Disable the modal behavior entirely
          disablePortal: true,
          hideBackdrop: true,
          style: {
            pointerEvents: 'none',
          }
        }}
        PaperProps={{
          sx: {
            pointerEvents: 'auto',
            backgroundColor: 'white',
            boxShadow: '-2px 0 8px rgba(0,0,0,0.15)',
          }
        }}
      >
        <Box sx={{ width: 300, p: 2, height: '100%', overflowY: 'auto' }}>
  
          {/* Header with Title + Close Button */}
          <Box 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              mb: 2 
            }}
          >
            <Typography variant="h6">
              Directions
            </Typography>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
  
          {/* Directions Content */}
          {directions.length === 0 ? (
            <Typography>No directions available.</Typography>
          ) : (
            directions.map((step, index) => (
              <Box key={index} sx={{ mb: 2 }}>
                <Typography variant="subtitle2">{step.summary}</Typography>
                <Typography variant="body2" color="textSecondary">
                  {step.instructions}
                </Typography>
              </Box>
            ))
          )}
        </Box>
      </Drawer>
    );
}