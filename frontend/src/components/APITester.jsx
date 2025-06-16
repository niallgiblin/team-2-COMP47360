import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI, friendsAPI, testAPI } from '../services/apiService';
import {
  Box,
  Button,
  Typography,
  Container,
  Paper,
  Alert,
  TextField,
  Grid,
  Divider,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

export default function APITester() {
  const { user, makeAuthenticatedRequest } = useAuth();
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});
  const [testInputs, setTestInputs] = useState({
    userId: '1',
    searchQuery: 'test',
    friendUsername: 'testfriend'
  });

  const setLoadingState = (key, value) => {
    setLoading(prev => ({ ...prev, [key]: value }));
  };

  const setResult = (key, value) => {
    setResults(prev => ({ ...prev, [key]: value }));
  };

  const handleInputChange = (field, value) => {
    setTestInputs(prev => ({ ...prev, [field]: value }));
  };

  // Test individual API endpoints
  const testGetProfile = async () => {
    const key = 'getProfile';
    setLoadingState(key, true);
    try {
      const result = await authAPI.getProfile(testInputs.userId);
      setResult(key, { success: true, data: result });
    } catch (error) {
      setResult(key, { success: false, error: error.message });
    } finally {
      setLoadingState(key, false);
    }
  };

  const testGetFriends = async () => {
    const key = 'getFriends';
    setLoadingState(key, true);
    try {
      const result = await friendsAPI.getFriendsList(testInputs.userId);
      setResult(key, { success: true, data: result });
    } catch (error) {
      setResult(key, { success: false, error: error.message });
    } finally {
      setLoadingState(key, false);
    }
  };

  const testSearchUsers = async () => {
    const key = 'searchUsers';
    setLoadingState(key, true);
    try {
      const result = await friendsAPI.searchUsers(testInputs.searchQuery, testInputs.userId);
      setResult(key, { success: true, data: result });
    } catch (error) {
      setResult(key, { success: false, error: error.message });
    } finally {
      setLoadingState(key, false);
    }
  };

  const testAddFriend = async () => {
    const key = 'addFriend';
    setLoadingState(key, true);
    try {
      const result = await friendsAPI.addFriend(testInputs.userId, testInputs.friendUsername);
      setResult(key, { success: true, data: result });
    } catch (error) {
      setResult(key, { success: false, error: error.message });
    } finally {
      setLoadingState(key, false);
    }
  };

  const runCompleteAuthTest = async () => {
    const key = 'completeAuthTest';
    setLoadingState(key, true);
    try {
      const result = await testAPI.testAuth();
      setResult(key, result);
    } catch (error) {
      setResult(key, { success: false, error: error.message });
    } finally {
      setLoadingState(key, false);
    }
  };

  const runCompleteFriendsTest = async () => {
    const key = 'completeFriendsTest';
    setLoadingState(key, true);
    try {
      const result = await testAPI.testFriends(testInputs.userId);
      setResult(key, result);
    } catch (error) {
      setResult(key, { success: false, error: error.message });
    } finally {
      setLoadingState(key, false);
    }
  };

  const renderResult = (key) => {
    const result = results[key];
    if (!result) return null;

    return (
      <Alert 
        severity={result.success ? 'success' : 'error'} 
        sx={{ mt: 2, wordBreak: 'break-word' }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
          {result.success ? 'Success!' : 'Error:'}
        </Typography>
        <pre style={{ fontSize: '12px', overflow: 'auto', maxHeight: '200px' }}>
          {JSON.stringify(result.success ? result.data : result.error, null, 2)}
        </pre>
      </Alert>
    );
  };

  const renderTestButton = (key, label, onClick, disabled = false) => (
    <Button
      variant="contained"
      onClick={onClick}
      disabled={loading[key] || disabled}
      sx={{ minWidth: '150px' }}
    >
      {loading[key] ? <CircularProgress size={20} /> : label}
    </Button>
  );

  return (
    <Container maxWidth="lg">
      <Paper elevation={4} sx={{ mt: 4, p: 4, borderRadius: 2 }}>
        <Typography variant="h4" align="center" gutterBottom>
          Backend API Tester
        </Typography>
        
        {user && (
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="subtitle2">
              Current User: {user.username} (ID: {user.id}) - {user.email}
            </Typography>
          </Alert>
        )}

        {/* Test Inputs */}
        <Accordion sx={{ mb: 3 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Test Parameters</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="User ID"
                  value={testInputs.userId}
                  onChange={(e) => handleInputChange('userId', e.target.value)}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Search Query"
                  value={testInputs.searchQuery}
                  onChange={(e) => handleInputChange('searchQuery', e.target.value)}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Friend Username"
                  value={testInputs.friendUsername}
                  onChange={(e) => handleInputChange('friendUsername', e.target.value)}
                  fullWidth
                  size="small"
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Complete Test Suites */}
        <Typography variant="h6" sx={{ mb: 2 }}>
          Complete Test Suites
        </Typography>
        
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6}>
            <Box sx={{ textAlign: 'center' }}>
              {renderTestButton('completeAuthTest', 'Test Authentication System', runCompleteAuthTest)}
              {renderResult('completeAuthTest')}
            </Box>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ textAlign: 'center' }}>
              {renderTestButton('completeFriendsTest', 'Test Friends System', runCompleteFriendsTest)}
              {renderResult('completeFriendsTest')}
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />

        {/* Individual API Tests */}
        <Typography variant="h6" sx={{ mb: 2 }}>
          Individual API Tests
        </Typography>

        {/* Auth API Tests */}
        <Accordion sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">Authentication APIs</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    GET /api/auth/profile
                  </Typography>
                  {renderTestButton('getProfile', 'Get User Profile', testGetProfile)}
                  {renderResult('getProfile')}
                </Box>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Friends API Tests */}
        <Accordion sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">Friends APIs</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    GET /api/friends/list
                  </Typography>
                  {renderTestButton('getFriends', 'Get Friends List', testGetFriends)}
                  {renderResult('getFriends')}
                </Box>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    GET /api/friends/search
                  </Typography>
                  {renderTestButton('searchUsers', 'Search Users', testSearchUsers)}
                  {renderResult('searchUsers')}
                </Box>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    POST /api/friends/add
                  </Typography>
                  {renderTestButton('addFriend', 'Add Friend', testAddFriend)}
                  {renderResult('addFriend')}
                </Box>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        <Alert severity="info" sx={{ mt: 3 }}>
          <Typography variant="body2">
            <strong>Usage:</strong> This component helps test all backend API endpoints. 
            Use the "Complete Test Suites" for comprehensive testing, or individual tests for specific endpoints.
            Check the browser console for detailed logs.
          </Typography>
        </Alert>
      </Paper>
    </Container>
  );
}