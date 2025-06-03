import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Box } from '@mui/material';

import NavBar from './components/NavBar';
import Home from './pages/Home';
import MapView from './pages/MapView';
import Recommendations from './pages/Recommendations';
import VenueDetail from './pages/VenueDetail';
import About from './pages/About';
import Skyline from './components/Skyline';
import Footer from './components/Footer';


function App() {
  return (
    <Router>
      {/* Full-width wrapper */}
      <Box sx={{ width: '100%', minHeight: '100vh', backgroundColor: '#000'}}>
        <NavBar />

          {/* Routes */}
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/recommendations" element={<Recommendations />} />
            <Route path="/venuedetail" element={<VenueDetail />} /> {/* static for preview */}
            <Route path="/venue/:id" element={<VenueDetail />} />   {/* dynamic ID-based routing */}
            <Route path="/about" element={<About />} />
          </Routes>
          <Skyline />
        <Footer />
      </Box>
    </Router>
  );
}

export default App;


