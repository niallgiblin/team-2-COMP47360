import { Routes, Route, Navigate } from "react-router-dom";
import { Box } from "@mui/material";
import React from "react";

// Import existing components
import NavBar from "./components/NavBar";
import Home from "./pages/Home";
import MapView from "./pages/MapView";
import Recommendations from "./pages/Recommendations";
import FindMyVibe from "./pages/FindMyVibe";
import About from "./pages/About";
import Skyline from "./components/Skyline";
import Footer from "./components/Footer";
import Login from "./pages/Login.jsx";
import AIChatWidget from "./components/AIChatWidget";
import Signup from "./pages/Signup.jsx";

// Import new authentication components
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./hooks/useAuth";
import { FriendRequestProvider } from "./context/FriendRequestContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Profile from "./pages/Profile";

import { LikeProvider } from "./context/LikeContext";
import { PlanProvider } from "./context/PlanContext";

// import APITester from './components/APITester'; // Uncomment if you want to use API testing tool

// Simple Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ padding: 2 }}>
          <h2>Something went wrong with FindMyVibe</h2>
          <p>Error: {this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </Box>
      );
    }

    return this.props.children;
  }
}

// Component to conditionally render Skyline and Footer
function AppLayout({ children }) {
  const { isAuthenticated } = useAuth();

  return (
    <Box 
      sx={{ 
        backgroundColor: '#000000', 
        minHeight: '100vh' 
      }}
    >
      <NavBar />

      <Box sx={{ minHeight: "calc(100vh - 200px)" }}>{children}</Box>

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

// App content with routes
function AppContent() {
  return (
    <AppLayout>
      <Routes>
        {/* Public routes - pages that don't require login */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/about" element={<About />} />
        <Route path="/" element={<Home />} />

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
              <ErrorBoundary>
                <FindMyVibe />
              </ErrorBoundary>
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

// Main App component wrapped with all context providers
function App() {
  return (
    <AuthProvider>
      <FriendRequestProvider>
        <LikeProvider>
          <PlanProvider>
            <AppContent />
          </PlanProvider>
        </LikeProvider>
      </FriendRequestProvider>
    </AuthProvider>
  );
}

export default App;
