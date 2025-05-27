import './App.css';
import NavBar from './components/NavBar';
import Home from './pages/Home';
import MapView from './pages/MapView';
import Recommendations from './pages/Recommendations';
import VenueDetail from './pages/VenueDetail';
import About from './pages/About';


import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <Router>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/map" element={<MapView />} />
        <Route path="/recommendations" element={<Recommendations />} />
        <Route path="/venue/:id" element={<VenueDetail />} /> {/* :id is a placeholder for individual venues */}
        <Route path="/about" element={<About />} />
      </Routes>
    </Router>
  );
}

export default App;
