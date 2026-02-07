import { useState, useEffect } from 'react';
import { connectWebSocket, sendMessage } from '../utils/socket';
import { generateRoomCode } from '../utils/generateRoomCode';
import '../styles/HostScreen.css';
import { useNavigate } from 'react-router-dom';
import Bracket from '../components/Bracket'; // 👈 Import Bracket component!

export default function HostScreen() {
  const [roomCode, setRoomCode] = useState('');
  const [hostToken, setHostToken] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [bracket, setBracket] = useState([]);
  const [category, setCategory] = useState('');
  const [phase, setPhase] = useState('lobby');
  const [playerCount, setPlayerCount] = useState(0);
  const [playerNames, setPlayerNames] = useState([]);
  const [battleWinners, setBattleWinners] = useState({});
  const [champion, setChampion] = useState('');
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem('role', 'host');
    const code = localStorage.getItem('roomCode') || generateRoomCode();
    const savedToken = localStorage.getItem('hostToken') || '';
    localStorage.setItem('roomCode', code);
    setRoomCode(code);
    setHostToken(savedToken);

    const handleSocketMessage = (event) => {
      console.log('Received event on HostScreen:', event.data);

      try {
        const data = JSON.parse(event.data);

        if (data.action === 'room_created') {
          setHostToken(data.hostToken);
          localStorage.setItem('hostToken', data.hostToken);
          setPhase('lobby');
          setPlayerCount(data.playerCount || 0);
        } else if (data.action === 'host_state') {
          setPhase(data.phase || 'lobby');
          setCategory(data.category || '');
          setSubmissions(Array.isArray(data.submissions) ? data.submissions : []);
          setBracket(Array.isArray(data.bracket) ? data.bracket : []);
          setBattleWinners(data.battleWinners || {});
          setSubmissionsOpen(data.phase === 'submissions');
          if (typeof data.playerCount === 'number') {
            setPlayerCount(data.playerCount);
          }
        } else if (data.action === 'new_submission') {
          setSubmissions((prev) => [...prev, data.item]);
        } else if (data.action === 'submissions_list') {
          console.log('Received old submissions:', data.submissions);
          setSubmissions(data.submissions);
        } else if (data.action === 'voting_complete') {
          console.log('Bracket received:', data.bracket);
          setBracket(data.bracket);
          setPhase('battle');
        } else if (data.action === 'start_submissions') {
          setPhase('submissions');
          setSubmissionsOpen(true);
        } else if (data.action === 'submissions_ended') {
          setSubmissionsOpen(false);
        } else if (data.action === 'battle_result') {
          const key = `${data.battle.item1}||${data.battle.item2}`;
          setBattleWinners((prev) => ({ ...prev, [key]: data.winner }));
        } else if (data.action === 'player_count') {
          setPlayerCount(data.count || 0);
          const code = localStorage.getItem('roomCode') || roomCode;
          if (code) {
            sendMessage({ action: 'get_players', roomCode: code });
          }
        } else if (data.action === 'player_list') {
          setPlayerNames(data.players || []);
        } else if (data.action === 'error') {
          if (data.message === 'Room not found.' || data.message === 'Invalid host token.') {
            localStorage.removeItem('hostToken');
            setHostToken('');
            sendMessage({ action: 'create_room', roomCode });
          }
        }
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    };

    connectWebSocket(() => {
      console.log('WebSocket open!');
      const token = localStorage.getItem('hostToken');
      if (!token) {
        sendMessage({ action: 'create_room', roomCode: code });
      } else {
        sendMessage({ action: 'get_submissions', roomCode: code });
        sendMessage({ action: 'get_players', roomCode: code });
      }
    }, handleSocketMessage, { role: 'host', roomCode: code, hostToken: savedToken });
  }, []);

  const handleStartSubmissions = () => {
    if (!category.trim()) return;
    setSubmissions([]);
    setBracket([]);
    setBattleWinners({});
    setChampion('');
    setPhase('submissions');
    setSubmissionsOpen(true);
    sendMessage({ action: 'start_submissions', category: category.trim() });
  };

  const handleEndSubmissions = () => {
    setSubmissionsOpen(false);
    sendMessage({ action: 'end_submissions' });
  };

  const handleStartVoting = () => {
    console.log('Start Voting clicked');
    setPhase('voting');
    sendMessage({ action: 'start_voting', submissions });
  };

  const handleEndGame = () => {
    sendMessage({ action: 'end_game' });
    localStorage.removeItem('roomCode');
    localStorage.removeItem('hostToken');
    localStorage.removeItem('bracket');
    navigate('/');
  };

  const handleStartBattle = (match) => {
    console.log('Starting battle between:', match.item1, 'and', match.item2);
    sendMessage({
      action: 'start_battle',
      battle: {
        item1: match.item1,
        item2: match.item2,
      },
    });
  };

  useEffect(() => {
    if (bracket.length === 0) {
      setChampion('');
      return;
    }

    const resolveWinner = (match) => {
      const key = `${match.item1}||${match.item2}`;
      if (battleWinners[key]) return battleWinners[key];
      if (match.winner) return match.winner;
      if (match.item2 === 'BYE' && match.item1) return match.item1;
      if (match.item1 === 'BYE' && match.item2) return match.item2;
      return null;
    };

    let currentRound = bracket.map((match) => ({
      ...match,
      winner: resolveWinner(match),
    }));

    while (currentRound.length > 1) {
      const nextRound = [];
      for (let i = 0; i < currentRound.length; i += 2) {
        const left = currentRound[i];
        const right = currentRound[i + 1];
        const item1 = left?.winner || null;
        const item2 = right?.winner || null;
        let winner = null;
        if (item1 && item2) {
          const key = `${item1}||${item2}`;
          winner = battleWinners[key] || null;
        } else if (item1 && !item2) {
          winner = item1;
        } else if (item2 && !item1) {
          winner = item2;
        }
        nextRound.push({
          item1,
          item2,
          winner,
        });
      }
      currentRound = nextRound;
    }

    const finalWinner = currentRound[0]?.winner || '';
    if (finalWinner && currentRound[0]?.item1 && currentRound[0]?.item2) {
      setChampion(finalWinner);
    } else {
      setChampion('');
    }
  }, [bracket, battleWinners]);

  useEffect(() => {
    if (playerCount === 0 || playerNames.length === playerCount) return;
    const code = localStorage.getItem('roomCode') || roomCode;
    if (!code) return;
    const timer = setTimeout(() => {
      sendMessage({ action: 'get_players', roomCode: code });
    }, 300);
    return () => clearTimeout(timer);
  }, [playerCount, playerNames, roomCode]);

  return (
    <div className="host-container">
      {phase === 'lobby' ? (
        <div className="host-lobby">
          <div className="host-lobby-top">
            <div className="room-code-large">Room Code: {roomCode}</div>
            <div className="category-row">
              <input
                type="text"
                placeholder="Set category (e.g., types of cuisine)"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input"
              />
            </div>
            <button
              onClick={handleStartSubmissions}
              className={`neon-button big-start ${category.trim() && playerNames.length > 0 ? '' : 'disabled'}`}
              disabled={!(category.trim() && playerNames.length > 0)}
            >
              Start
            </button>
          </div>

          <div className="panel">
            <h3 className="panel-title">Players</h3>
            {playerNames.length === 0 ? (
              <p className="muted">No players yet.</p>
            ) : (
              <ul className="player-list">
                {playerNames.map((name, idx) => (
                  <li key={`${name}-${idx}`}>{name}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="host-header">
            <div className="pill">Room Code: {roomCode}</div>
          </div>

          <div className="host-grid full-width">
        <div className={`panel ${bracket.length > 0 ? 'bracket-panel' : ''}`}>
          {bracket.length === 0 ? (
            <>
              <h3 className="submissions-title">Submitted Items</h3>
              {submissions.length === 0 ? (
                <p className="muted">No submissions yet.</p>
              ) : (
                <ul className="submissions-list">
                  {submissions.map((item, idx) => (
                    <li key={idx} className="submissions-item">
                      {idx + 1}. {item}
                    </li>
                  ))}
                </ul>
              )}

              {phase === 'submissions' && submissionsOpen && (
                <button className="start-voting-button ghost-button" onClick={handleEndSubmissions}>
                  End Submissions
                </button>
              )}

              {!submissionsOpen && submissions.length > 0 && (
                <button className="start-voting-button neon-button" onClick={handleStartVoting}>
                  Start Voting
                </button>
              )}
                </>
              ) : (
                <>
                  <h3 className="submissions-title">Bracket</h3>
                  <Bracket
                    bracket={bracket}
                    onStartBattle={handleStartBattle}
                    battleWinners={battleWinners}
                    champion={champion}
                  />
                </>
              )}
            </div>
          </div>
        </>
      )}

      <button className="end-game-button end-game-floating" onClick={handleEndGame}>
        End Game
      </button>
    </div>
  );
}
