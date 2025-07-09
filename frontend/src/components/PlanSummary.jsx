import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { useAuth } from '../context/AuthContext';
import VenueCard from './VenueCard';

export default function PlanSummary() {
  const { plan, savePlan, loadPlan, clearPlan } = usePlan();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [tempPlanName, setTempPlanName] = useState('');


  const [savedDialogOpen, setSavedDialogOpen] = useState(false);
  const [lastSavedPlan, setLastSavedPlan] = useState(null);


  const handleSave = () => {
    setTempPlanName('');
    setNameDialogOpen(true);
  };
  
  const confirmSave = async () => {
    if (tempPlanName.trim()) {
      const saved = await savePlan(tempPlanName.trim());
      if (saved) {
        setLastSavedPlan(saved);
        setSavedDialogOpen(true);
        setNameDialogOpen(false);
      }
    }
  };
    
  return (
  <Box
    sx={{
      mt: { xs: 2, md: 3.6 },
      p: 3,
      border: '2px solid #3ABEFF',
      borderRadius: 3,
      backgroundColor: '#000',
      width: '90%',
      maxWidth: '100%',
      mx: 'auto',
      overflowX: 'hidden',
    }}
  >
    {/* Responsive heading + View Map button */}
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'flex-start', md: 'center' },
        mb: 2,
      }}
    >
      <Box>
        <Typography
          variant="h6"
          sx={{
            color: '#fff',
            fontWeight: 'bold',
            textAlign: { xs: 'center', md: 'left' },
          }}
        >
          {user?.firstName ? `Plan for ${user.firstName}` : 'My Plan'}
        </Typography>

        <Typography
          variant="body2"
          sx={{
            mb: 2,
            color: '#aaa',
            textAlign: { xs: 'center', md: 'left' },
          }}
        >
          {plan.length} of 3 spots added
        </Typography>
      </Box>

      {plan.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            alignItems: { xs: 'flex-start', md: 'flex-end' },
          }}
        >
          <Button
            variant="contained"
            onClick={() => navigate('/map', { state: { fromPlan: true } })}
            sx={{
              mt: { xs: 1, md: 0 },
              mb: { xs: 0, md: 1 },
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
              color: '#000',
              fontWeight: 'bold',
              borderRadius: '8px',
              px: 2,
              py: 1,
              fontSize: '0.9rem',
              '&:hover': {
                background: 'linear-gradient(to right, #FF4ECD, #3ABEFF)',
              },
            }}
          >
            View On Map
          </Button>

          <Button
            onClick={handleSave}
            variant="outlined"
            sx={{
              borderColor: '#FF4ECD',
              color: '#FF4ECD',
              fontWeight: 'bold',
              px: 3,
              borderRadius: '8px',
              textTransform: 'none',
              '&:hover': {
                background: 'rgba(255, 78, 205, 0.1)',
              },
            }}
          >
            Save Plan
          </Button>

          <Button
            onClick={clearPlan}
            variant="text"
            sx={{
              color: '#fff',
              fontSize: '0.9rem',
              mt: 0.3,
              textDecoration: 'underline',
              textTransform: 'none',
              '&:hover': {
                color: '#FF4ECD',
                textDecoration: 'none',
              },
            }}
          >
            Start New Plan
          </Button>
        </Box>
      )}
    </Box>

    {/* Content below actions */}
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {plan.length === 0 ? (
        <Box
          sx={{
            border: '1px dashed #555',
            backgroundColor: '#111',
            borderRadius: 2,
            p: 2,
            mt: 1,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: '#aaa',
              fontStyle: 'italic',
              textAlign: 'center',
            }}
          >
            You can add up to 3 venues to your plan by clicking “Add to Plan”.
          </Typography>
        </Box>
      ) : (
        plan.map((venue) => <VenueCard key={venue.id} venue={venue} />)
      )}
    </Box>

      <Dialog
        open={nameDialogOpen}
        onClose={() => setNameDialogOpen(false)}
        PaperProps={{
          sx: {
            backgroundColor: '#000',
            color: '#fff',
            borderRadius: 3,
            border: '2px solid #3ABEFF',
            p: 2,
          },
        }}
      >
        <DialogTitle 
          sx={{ 
            fontWeight: 'bold', 
            color: '#3ABEFF' 
          }}
        >
          Name Your Plan
        </DialogTitle>

        <DialogContent>
          <input
            value={tempPlanName}
            onChange={(e) => setTempPlanName(e.target.value)}
            placeholder="Enter a name..."
            style={{
              width: '100%',
              padding: '10px',
              marginTop: '10px',
              backgroundColor: '#222',
              color: '#fff',
              border: '1px solid #3ABEFF',
              borderRadius: '6px',
              fontSize: '1rem',
            }}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setNameDialogOpen(false)} sx={{ color: '#aaa' }}>
            Cancel
          </Button>
          <Button onClick={confirmSave} sx={{ color: '#FF4ECD', fontWeight: 'bold' }}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

          
        <Dialog
          open={savedDialogOpen}
          onClose={() => setSavedDialogOpen(false)}
          PaperProps={{
            sx: {
              backgroundColor: '#000',
              color: '#fff',
              borderRadius: 3,
              border: '2px solid #FF4ECD',
              p: 2,
            },
          }}
        >
          <DialogTitle 
            sx={{ 
              fontWeight: 'bold', 
              color: '#FF4ECD' 
            }}
          >
            Plan Saved!
          </DialogTitle>

          <DialogContent 
            sx={{ 
              color: '#fff' 
            }}
            >
            What would you like to do next?
          </DialogContent>

            <DialogActions 
              sx={{ 
                justifyContent: 'flex-end', 
                gap: 2, 
                mt: 1 
              }}
            >
            {[
            { label: 'View Saved Plans', action: () => {
                setSavedDialogOpen(false);
                navigate('/profile', { state: { showSavedPlans: true } });
              }},
            { label: 'View on Map', action: () => {
                if (lastSavedPlan) {
                  loadPlan(lastSavedPlan);
                  navigate('/map', { state: { fromPlan: true } });
                }
              }},
            { label: 'Start New Plan', action: () => {
                clearPlan();
                setSavedDialogOpen(false);
              }},
          ].map(({ label, action }) => (
            <Button
              key={label}
              onClick={action}
              sx={{
                color: '#fff',
                textTransform: 'none',
                fontWeight: 'bold',
                textDecoration: 'underline',
                '&:hover': {
                  color: '#FF4ECD',
                  textDecoration: 'none',
                },
              }}
            >
              {label}
            </Button>
          ))}
        </DialogActions>
      </Dialog>
    </Box>
  );  
}
