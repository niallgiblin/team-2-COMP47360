import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Container,
  Paper
} from '@mui/material';

// Login component
// handles user authentication
export default function Login() {
  const { login } = useAuth();      // get the login function from auth context
  
  // form field state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // state for error messsage display
  const [error, setError] = useState('');

  // form submission
  const handleSubmit = async (e) => {
    e.preventDefault();         // prevent page reload
    setError('');               // clear any existing error message

    try {
      await login(email, password);             // attempt login
    } catch (err) {
      setError('Invalid login credentials.');   // show error if fail
    }
  };

  return (
    // centre login form in container
    <Container maxWidth="sm">
      <Paper 
        elevation={4}            // shadow effect
        sx={{ 
            mt: 8,              // top margin
            p: 4,               // padding
            borderRadius: 2     // rounded corners
        }}
    >
        {/* heading text*/}
        <Typography 
            variant="h4" 
            align="center" 
            gutterBottom
        >
          Log In
        </Typography>

        {/* show error message if login fails*/}
        {error && (
          <Typography 
            color="error" 
            align="center" 
            sx={{ 
                mb: 2 
            }}
            >
            {error}
          </Typography>
        )}

        <Box 
            component="form" 
            onSubmit={handleSubmit} 
            sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 3 
            }}
        >

        {/* email input */}
          <TextField
            label="Email"
            type="email"
            required
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {/* password input */}
          <TextField
            label="Password"
            type="password"
            required
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {/* submit button */}
          <Button
            type="submit"
            variant="contained"
            size="large"
            sx={{
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
              fontWeight: 'bold',
              color: '#121212',
              '&:hover': {
                background: 'linear-gradient(to right, #5F3AFF, #FF6EDB)',
              }
            }}
          >
            Log In
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}

