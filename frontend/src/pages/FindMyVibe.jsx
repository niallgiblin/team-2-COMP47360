import { useState } from 'react';
import { Box, Typography, TextField, Button, MenuItem, FormControl, Select, InputLabel } from '@mui/material';
import PageWrapper from '../components/PageWrapper';
import TrendingVenueCard from '../components/TrendingVenueCard';
import mockVenues from '../data/mockVenues'; // replace later with real fetch API call

export default function FindMyVibe() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState([]);
  const [vibe, setVibe] = useState('');
  const [venueType, setVenueType] = useState('');
  const [cuisine, setCuisine] = useState('');

  const handleSearch = () => {
    const filtered = mockVenues.filter(venue => {
      const tags = venue.tags.map(tag => tag.toLowerCase());
      
      const inputMatch = input
        ? tags.some(tag => tag.includes(input.toLowerCase()))
        : false;
  
      const vibeMatch = vibe
        ? tags.some(tag => tag.includes(vibe.toLowerCase()))
        : false;
  
      const typeMatch = venueType
        ? tags.some(tag => tag.includes(venueType.toLowerCase()))
        : false;
  
      const cuisineMatch = cuisine
        ? tags.some(tag => tag.includes(cuisine.toLowerCase()))
        : false;
  
      // Show venues that match ANY filter (OR logic)
      return inputMatch || vibeMatch || typeMatch || cuisineMatch;
    });
  
    setResults(filtered);
  };
  

  const handleGetDirections = (venue) => {
    console.log('User wants directions to:', venue.name);
    // Future: route to /map with selected venue
  };

  return (
    <PageWrapper>
      <Box 
        sx={{ 
            maxWidth: 800, 
            mx: 'auto', 
            mb: 10, 
            px: 2 
            }}
        >
        {/* Header */}
        <Typography 
            variant="h4" 
            align="center" 
            gutterBottom
            sx={{
                fontWeight: 'bold',
                background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
        >
          Find Your Vibe
        </Typography>
        <Typography variant="body2" align="center" sx={{ mb: 4, color: '#aaa' }}>
          Describe your perfect night out — or choose from the filters below.
        </Typography>

        {/* Text Input */}
        <Box
            // form to allow user to press enter as on option, instead of clicking button
            component="form"
            onSubmit={(e) => {
                e.preventDefault(); // prevent page reload
                handleSearch();
            }} 
            sx={{ 
                display: 'flex', 
                gap: 2, 
                mb: 4, 
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: 'stretch', 
                }}
            >
          <TextField
            fullWidth
            label="e.g. cosy Jazz cafe"
            variant="outlined"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            sx={{ 
                backgroundColor: '#fff', 
                borderRadius: 1,
                flex: 1, 
                '& .MuiInputBase-input': {
                    height: '24px',
                    padding: '16.5px 14px', 
                },
            }}
          />
          <Button
            variant="contained"
            type="submit"
            onClick={handleSearch}
            sx={{
                background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                height: '56px',
                color: '#121212',
                fontWeight: 'bold',
                px: 4,
                py: 1.5,
                fontSize: '1rem',
                borderRadius: '8px',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                '&:hover': {
                  background: 'linear-gradient(to right, #5F3AFF, #FF6EDB)',
                },
            }}
          >
            Find My Vibe
          </Button>
        </Box>

        <Box 
            sx={{ 
                display: 'flex', 
                flexDirection: { xs: 'column', sm: 'row' }, 
                gap: 2, 
                flexWrap: 'wrap', 
                mb: 4 
            }}
            >
            {/* Vibe Dropdown */}
            <FormControl 
                sx={{ 
                    flex: 1, 
                    minWidth: 120,
                    backgroundColor: '#fff',
                    borderRadius: 1,
                    mt: 1 
                    }}
                >
                <InputLabel id="vibe-label">Vibe</InputLabel>
                <Select
                labelId="vibe-label"
                value={vibe}
                label="Vibe"
                onChange={(e) => setVibe(e.target.value)}
                >
                <MenuItem value=""><em>None</em></MenuItem>
                <MenuItem value="cozy">Cozy</MenuItem>
                <MenuItem value="jazz">Jazz</MenuItem>
                <MenuItem value="trendy">Trendy</MenuItem>
                <MenuItem value="underground">Underground</MenuItem>
                </Select>
            </FormControl>

        {/* Venue Type Dropdown */}
        <FormControl 
            sx={{                     
                flex: 1, 
                minWidth: 120,
                backgroundColor: '#fff',
                borderRadius: 1,
                mt: 1
                }}
            >
            <InputLabel id="type-label">Venue Type</InputLabel>
            <Select
            labelId="type-label"
            value={venueType}
            label="Venue Type"
            onChange={(e) => setVenueType(e.target.value)}
            >
            <MenuItem value=""><em>None</em></MenuItem>
            <MenuItem value="bar">Bar</MenuItem>
            <MenuItem value="club">Club</MenuItem>
            <MenuItem value="restaurant">Restaurant</MenuItem>
            <MenuItem value="rooftop">Rooftop</MenuItem>
            </Select>
        </FormControl>

        {/* Cuisine Dropdown */}
        <FormControl 
            sx={{                 
                flex: 1, 
                minWidth: 120,
                backgroundColor: '#fff',
                borderRadius: 1,
                mt: 1 
                }}
            >
            <InputLabel id="cuisine-label">Cuisine</InputLabel>
            <Select
            labelId="cuisine-label"
            value={cuisine}
            label="Cuisine"
            onChange={(e) => setCuisine(e.target.value)}
            >
            <MenuItem value=""><em>None</em></MenuItem>
            <MenuItem value="italian">Italian</MenuItem>
            <MenuItem value="thai">Thai</MenuItem>
            <MenuItem value="greek">Greek</MenuItem>
            <MenuItem value="mexican">Mexican</MenuItem>
            </Select>
        </FormControl>
        </Box>


        {/* No Results */}
        {results.length === 0 && (input || vibe || venueType || cuisine) && (
          <Typography align="center" sx={{ color: '#aaa', mb: 4 }}>
            No matching venues found.
          </Typography>
        )}

        {/* Results */}
        {results.map((venue, index) => (
          <TrendingVenueCard
            key={venue.id}
            venue={venue}
            rank={index + 1}
            onGetDirections={handleGetDirections}
          />
        ))}
      </Box>
    </PageWrapper>
  );
}
