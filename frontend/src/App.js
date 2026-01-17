import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AuctionDashboard from './components/AuctionDashboard/AuctionDashboard';
import AdminPanel from './components/AdminPanel/AdminPanel';
import PlayerRegistration from './components/PlayerRegistration/PlayerRegistration';
import OwnerDashboard from './components/OwnerDashboard/OwnerDashboard';
import Login from './components/Login/Login';
import UserRegistration from './components/UserRegistration/UserRegistration';
import Leaderboard from './components/Leaderboard/Leaderboard';
import Navbar from './components/Navbar/Navbar';
import './App.css';
const Players = React.lazy(() => import('./components/Players/PlayersList'));

function App() {
  return (
    <Router>
      <div className="app-shell">
        <Navbar />

        <main className="app-main">
          <Routes>
            <Route path="/" element={<AuctionDashboard />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<UserRegistration />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/register-player" element={<PlayerRegistration />} />
            <Route
              path="/players"
              element={
                <React.Suspense fallback={<div className="page-loading">Loading players...</div>}>
                  <Players />
                </React.Suspense>
              }
            />
            <Route path="/owner-squad" element={<OwnerDashboard />} />
            <Route path="/admin" element={<AdminPanel />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
