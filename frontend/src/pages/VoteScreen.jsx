import { useState, useEffect } from 'react';
import { connectWebSocket, sendMessage } from '../utils/socket';
import { useNavigate } from 'react-router-dom'; // 👈 ADD THIS
import '../styles/VoteScreen.css';

export default function VoteScreen() {
  const [submissions, setSubmissions] = useState([]);
  const [votes, setVotes] = useState({});
  const [remainingVotes, setRemainingVotes] = useState(10);
  const [votingStarted, setVotingStarted] = useState(false); // 👈 ADD THIS
  const navigate = useNavigate(); // 👈 ADD THIS

  useEffect(() => {
    connectWebSocket(undefined, undefined, {
      onClose: () => navigate('/'),
    });

    const pendingVoting = localStorage.getItem('pendingVoting');
    if (pendingVoting) {
      try {
        const parsed = JSON.parse(pendingVoting);
        setSubmissions(parsed.submissions || []);
        setVotes({});
        setRemainingVotes(parsed.votesPerPlayer || 10);
        setVotingStarted(true);
      } catch (err) {
        console.error('Error parsing pendingVoting:', err);
      }
      localStorage.removeItem('pendingVoting');
    }

    if (window.socket) {
      window.socket.onmessage = (event) => {
        console.log('Received event on VoteScreen:', event.data);
  
        try {
          const data = JSON.parse(event.data);
  
          if (data.action === 'start_voting') {
            setSubmissions(data.submissions);
            setVotes({});
            setRemainingVotes(data.votesPerPlayer || 10);
            setVotingStarted(true);
          }
          else if (data.action === 'voting_complete') {
            console.log('Voting complete! Moving to bracket.');
            navigate('/battle');
          }
          else if (data.action === 'game_over') {
            navigate('/');
          }
          
        } catch (err) {
          console.error('Error parsing voting message:', err);
        }
      };
    }
  }, []);
  

  const handleVote = (item) => {
    if (remainingVotes <= 0) return;

    setVotes(prev => ({
      ...prev,
      [item]: (prev[item] || 0) + 1,
    }));
    setRemainingVotes(prev => prev - 1);
  };

    const handleSubmitVotes = () => {
      console.log('Submitting votes:', votes);
      sendMessage({
        action: 'submit_votes',
        votes,
      });
    };
    
  

  return (
    <div className="vote-container">
      <h1>Voting Screen</h1>

      {!votingStarted ? (
        <p>Waiting for host to start voting...</p>
      ) : (
        <>
          <h2>Votes Remaining: {remainingVotes}</h2>
          <ul className="submission-list">
            {submissions.map((item, idx) => (
              <li key={idx} className="submission-item">
                {item}
                <button 
                  onClick={() => handleVote(item)}
                  disabled={remainingVotes <= 0}
                  className="vote-button"
                >
                  +1 Vote
                </button>
                <span className="vote-count">({votes[item] || 0})</span>
              </li>
            ))}
          </ul>

          {remainingVotes === 0 && (
            <button onClick={handleSubmitVotes} className="submit-votes-button">
              Submit My Votes
            </button>
          )}
        </>
      )}
    </div>
  );
}
