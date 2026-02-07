import { useState, useEffect } from 'react';
import { connectWebSocket, sendMessage } from '../utils/socket';
import { useNavigate } from 'react-router-dom';
import '../styles/BattleScreen.css'; // We'll make this file too

export default function BattleScreen() {
  const [battle, setBattle] = useState(null);
  const [voted, setVoted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    connectWebSocket(undefined, undefined, {
      onClose: () => navigate('/'),
    });

    if (window.socket) {
      window.socket.onmessage = (event) => {
        console.log('BattleScreen received:', event.data);

        try {
          const data = JSON.parse(event.data);

          if (data.action === 'battle_start') {
            console.log('Starting battle:', data.battle);
            setBattle(data.battle);
            setVoted(false); // Reset voted state for new battle
          } else if (data.action === 'battle_result') {
            console.log('Battle ended. Waiting for next battle...');
            setBattle(null); // Clear battle
            setVoted(false);
          } else if (data.action === 'game_over') {
            navigate('/');
          }
        } catch (err) {
          console.error('Error parsing battle message:', err);
        }
      };
    }
  }, [navigate]);

  const handleVote = (choice) => {
    if (!battle || voted) return; // Can't double vote

    sendMessage({
      action: 'submit_battle_vote',
      vote: choice,
    });

    setVoted(true);
  };

  if (!battle) {
    return (
      <div className="screen">
        <div className="battle-container">
          <h2>Waiting for next battle...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="battle-container">
        <h1>Battle Time!</h1>

        <div className="battle-options">
          <button 
            className="battle-option" 
            onClick={() => handleVote(battle.item1)}
            disabled={voted}
          >
            {battle.item1}
          </button>

          <span className="vs-text">VS</span>

          <button 
            className="battle-option" 
            onClick={() => handleVote(battle.item2)}
            disabled={voted}
          >
            {battle.item2}
          </button>
        </div>

        {voted && <p className="voted-text">Vote submitted! Waiting for result...</p>}
      </div>
    </div>
  );
}
