import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import 'leaflet/dist/leaflet.css';
import { ThemeProvider, createTheme } from '@mui/material/styles'

// Create a custom MUI theme using Urbanist font
const theme = createTheme({
  typography: {
    fontFamily: 'Urbanist, sans-serif',
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </StrictMode>
)


