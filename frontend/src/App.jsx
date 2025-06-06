import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Box } from '@mui/material';

import NavBar from './components/NavBar';
import Home from './pages/Home';
import MapView from './pages/MapView';
import Recommendations from './pages/Recommendations';
import FindMyVibe from './pages/FindMyVibe';
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
            <Route path="/vibe" element={<FindMyVibe />} />
            <Route path="/about" element={<About />} />
          </Routes>
          <Skyline />
        <Footer />
      </Box>
    </Router>
  );
}

export default App;


