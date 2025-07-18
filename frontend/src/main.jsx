import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import 'leaflet/dist/leaflet.css';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LikeProvider } from './context/LikeContext'; // included here
import '@fortawesome/fontawesome-free/css/all.min.css';

// Create a custom MUI theme using Urbanist font
const theme = createTheme({
  typography: {
    fontFamily: 'Urbanist, sans-serif',
  },
});

createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ThemeProvider theme={theme}>
        <BrowserRouter>
          <AuthProvider>
            <LikeProvider>
              <App />
            </LikeProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </StrictMode>
);