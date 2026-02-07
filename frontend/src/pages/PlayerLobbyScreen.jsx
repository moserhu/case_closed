import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { connectWebSocket, sendMessage } from '../utils/socket';

export default function PlayerLobbyScreen() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState(localStorage.getItem('roomCode') || '');
  const [error, setError] = useState('');

  const handleSocketMessage = (event) => {
    console.log('PlayerLobbyScreen received:', event.data);
    try {
      const data = JSON.parse(event.data);

      if (data.action === 'join_ok') {
        if (data.phase === 'submissions') {
          navigate('/submit');
        } else if (data.phase === 'voting') {
          navigate('/vote');
        } else if (data.phase === 'battle') {
          navigate('/battle');
        }
      } else if (data.action === 'start_submissions') {
        if (data.category) localStorage.setItem('joinCategory', data.category);
        if (data.submissionEndsAt) localStorage.setItem('joinSubmissionEndsAt', String(data.submissionEndsAt));
        localStorage.setItem('joinPhase', 'submissions');
        navigate('/submit');
      } else if (data.action === 'start_voting') {
        localStorage.setItem('pendingVoting', JSON.stringify({
          submissions: data.submissions || [],
          votesPerPlayer: data.votesPerPlayer || 10,
        }));
        navigate('/vote');
      } else if (data.action === 'voting_complete') {
        navigate('/battle');
      } else if (data.action === 'game_over') {
        navigate('/');
      } else if (data.action === 'error') {
        setError(data.message || 'Something went wrong.');
        if (data.message === 'Room not found.') {
          localStorage.removeItem('roomCode');
          localStorage.removeItem('playerName');
          navigate('/');
        }
      }
    } catch (err) {
      console.error('Error parsing player lobby message:', err);
    }
  };

  useEffect(() => {
    localStorage.setItem('role', 'player');

    const code = localStorage.getItem('roomCode') || '';
    const name = localStorage.getItem('playerName') || '';
    setRoomCode(code);

    if (code && name) {
      connectWebSocket(() => {
        sendMessage({ action: 'join_room', roomCode: code, name });
      }, handleSocketMessage, {
        onClose: () => navigate('/'),
      });
    } else {
      localStorage.removeItem('roomCode');
      localStorage.removeItem('playerName');
      navigate('/');
    }
  }, []);

  return (
    <div className="screen">
      <div className="card" style={{ textAlign: 'center' }}>
        <h1 className="title">Lobby</h1>
        <div className="pill">Room Code: {roomCode || '---'}</div>
        <p className="subtitle">Waiting for host to begin...</p>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
