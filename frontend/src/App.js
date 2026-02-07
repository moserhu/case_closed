// frontend/src/App.js
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import HostScreen from './pages/HostScreen';
import JoinScreen from './pages/JoinScreen';
import VoteScreen from './pages/VoteScreen';
import SubmitScreen from './pages/SubmitScreen';
import BattleScreen from './pages/BattleScreen';
import PlayerLobbyScreen from './pages/PlayerLobbyScreen';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host" element={<HostScreen />} />
        <Route path="/join" element={<JoinScreen />} />
        <Route path="/lobby" element={<PlayerLobbyScreen />} />
        <Route path="/submit" element={<SubmitScreen />} />
        <Route path="/vote" element={<VoteScreen />} />
        <Route path="/battle" element={<BattleScreen />} />
      </Routes>
    </Router>
  );
}

export default App;
