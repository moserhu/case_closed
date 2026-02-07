import { useState, useEffect } from 'react';
import { connectWebSocket, sendMessage } from '../utils/socket';
import { useNavigate } from 'react-router-dom';
import '../styles/SubmitScreen.css';

export default function SubmitScreen() {
  const [item, setItem] = useState('');
  const [submittedItems, setSubmittedItems] = useState([]);
  const [phase, setPhase] = useState('waiting');
  const [category, setCategory] = useState('');
  const [submissionEndsAt, setSubmissionEndsAt] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    connectWebSocket(undefined, undefined, {
      onClose: () => navigate('/'),
    });

    const joinPhase = localStorage.getItem('joinPhase');
    const joinCategory = localStorage.getItem('joinCategory');
    const joinSubmissionEndsAt = localStorage.getItem('joinSubmissionEndsAt');
    if (joinPhase === 'submissions') {
      setPhase('submissions');
    }
    if (joinCategory) {
      setCategory(joinCategory);
    }
    if (joinSubmissionEndsAt) {
      setSubmissionEndsAt(Number(joinSubmissionEndsAt));
    }
    localStorage.removeItem('joinPhase');
    localStorage.removeItem('joinCategory');
    localStorage.removeItem('joinSubmissionEndsAt');

    if (window.socket) {
      window.socket.onmessage = (event) => {
        console.log('SubmitScreen received:', event.data);

        try {
          const data = JSON.parse(event.data);

          if (data.action === 'start_submissions') {
            setPhase('submissions');
            setCategory(data.category || '');
            setSubmissionEndsAt(data.submissionEndsAt || null);
          } else if (data.action === 'submissions_ended') {
            setSubmissionEndsAt(data.submissionEndsAt || Date.now());
            setPhase('closed');
          } else if (data.action === 'start_voting') {
            console.log('Voting started! Redirecting to vote screen...');
            localStorage.setItem('pendingVoting', JSON.stringify({
              submissions: data.submissions || [],
              votesPerPlayer: data.votesPerPlayer || 10,
            }));
            navigate('/vote');
          } else if (data.action === 'game_over') {
            navigate('/');
          }
        } catch (err) {
          console.error('Error parsing submit screen message:', err);
        }
      };
    }
  }, [navigate]);

  useEffect(() => {
    if (!submissionEndsAt) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, submissionEndsAt - Date.now());
      setTimeLeft(Math.ceil(remaining / 1000));
    }, 500);

    return () => clearInterval(interval);
  }, [submissionEndsAt]);

  const handleSubmit = () => {
    if (phase !== 'submissions') return;
    if (submissionEndsAt && Date.now() > submissionEndsAt) return;
    if (!item.trim()) return;

    sendMessage({
      action: 'submit_item',
      item: item.trim(),
    });

    setSubmittedItems((prev) => [...prev, item.trim()]);
    setItem('');
  };

  return (
    <div className="submit-container">
      <h1>Submit Your Ideas!</h1>
      {phase === 'waiting' && <p>Waiting for host to start...</p>}
      {phase === 'closed' && <p>Submissions are closed.</p>}
      {category && <p>Category: {category}</p>}
      {submissionEndsAt && <p>Time left: {timeLeft}s</p>}

      {phase === 'submissions' && (
        <>
          <input 
            type="text" 
            value={item} 
            onChange={(e) => setItem(e.target.value)} 
            placeholder="Type your idea..." 
            className="submit-input"
            disabled={submissionEndsAt && Date.now() > submissionEndsAt}
          />
          <button onClick={handleSubmit} className="submit-button">
            Submit
          </button>
        </>
      )}

      {submittedItems.length > 0 && (
        <>
          <h3>Submitted so far:</h3>
          <ul className="submitted-list">
            {submittedItems.map((idea, idx) => (
              <li key={idx}>{idea}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
