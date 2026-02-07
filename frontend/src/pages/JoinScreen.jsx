import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { connectWebSocket, sendMessage } from '../utils/socket';

export default function JoinScreen() {
  const [inputCode, setInputCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleJoin = () => {
    if (!inputCode || !playerName.trim()) return;

    connectWebSocket(() => {
      console.log('Connected, joining room...');
      sendMessage({
        action: 'join_room',
        roomCode: inputCode.toUpperCase(),
        name: playerName.trim(),
      });
      localStorage.setItem('roomCode', inputCode.toUpperCase());
      localStorage.setItem('playerName', playerName.trim());
    }, (event) => {
      console.log('Received message in JoinScreen:', event.data);

      try {
        const data = JSON.parse(event.data);
        if (data.action === 'join_ok') {
          setError('');
          localStorage.setItem('role', 'player');
          localStorage.setItem('joinedRoom', 'true');
          localStorage.setItem('joinPhase', data.phase || 'lobby');
          if (data.category) localStorage.setItem('joinCategory', data.category);
          if (data.submissionEndsAt) localStorage.setItem('joinSubmissionEndsAt', String(data.submissionEndsAt));

          navigate('/lobby');
        } else if (data.action === 'error') {
          setError(data.message || 'Unable to join room.');
        }
      } catch (err) {
        console.error('Error parsing message in JoinScreen:', err);
      }
    });
  };
  
  return (
    <div className="screen">
      <div className="card" style={{ textAlign: 'center' }}>
        <h1 className="title">Join a Room</h1>
        <p className="subtitle">Enter the code and your player name.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleJoin();
          }}
        >
          <input
            type="text"
            placeholder="Room Code"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            className="input"
            style={{ textTransform: 'uppercase' }}
          />
          <br /><br />
          <input
            type="text"
            placeholder="Player Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="input"
          />
          <div className="button-row">
            <button className="neon-button" type="submit">
              Enter Lobby
            </button>
          </div>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
