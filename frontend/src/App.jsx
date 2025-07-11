import { Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';

// Import existing components
import NavBar from './components/NavBar';
import Home from './pages/Home';
import MapView from './pages/MapView';
import Recommendations from './pages/Recommendations';
import FindMyVibe from './pages/FindMyVibe';
import About from './pages/About';
import Skyline from './components/Skyline';
import Footer from './components/Footer';
import Login from './pages/Login.jsx';
import AIChatWidget from './components/AIChatWidget';
import Signup from './pages/Signup.jsx';

// Import new authentication components
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Profile from './pages/Profile';

import { PlanProvider } from './context/PlanContext';

// import APITester from './components/APITester'; // Uncomment if you want to use API testing tool

// Component to conditionally render Skyline and Footer
function AppLayout({ children }) {
  const { isAuthenticated } = useAuth();
  
  return (
    <Box sx={{ width: '100%', minHeight: '100vh', backgroundColor: '#000' }}>
      <NavBar />
      
      {/* Routes */}
      <Box sx={{ minHeight: 'calc(100vh - 120px)' }}> {/* Reserve space for footer */}
        {children}
      </Box>
      
      {/* Only show Skyline and Footer on main pages, not on login/signup pages */}
      {isAuthenticated && (
        <>
          <Skyline />
          <Footer />
          <AIChatWidget />
        </>
      )}
    </Box>
  );
}

// Main App component wrapped with AuthProvider
function App() {
  return (
    <AuthProvider>
      <PlanProvider>
        <AppContent />
      </PlanProvider>
    </AuthProvider>
  );
}

// App content with routes
function AppContent() {
  return (
    <AppLayout>
      <Routes>
        {/* Public routes - pages that don't require login */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/about" element={<About />} />
        
        {/* Protected routes - pages that require login */}
        
        <Route 
          path="/map" 
          element={
            <ProtectedRoute>
              <MapView />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/recommendations" 
          element={
            <ProtectedRoute>
              <Recommendations />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/vibe" 
          element={
            <ProtectedRoute>
              <FindMyVibe />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/profile" 
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } 
        />
        
        {/* API testing page - for development use, can be removed in production */}
        {/* 
        <Route 
          path="/api-test" 
          element={
            <ProtectedRoute>
              <APITester />
            </ProtectedRoute>
          } 
        />
        */}
        
        {/* Catch all route - redirect unknown paths to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}


export default App;
