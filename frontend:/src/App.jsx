// import { useState } from 'react';
import './App.css'; // styling
import NavBar from './components/NavBar';
import Home from './pages/Home';
import { FaTrashAlt } from 'react-icons/fa';


function App() {
  return (
    <div className="App">
      <NavBar />
      <Home />
    </div>
  );
}

export default App;

