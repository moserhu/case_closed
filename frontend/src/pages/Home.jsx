// frontend/src/pages/Home.jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  useEffect(() => {
    document.body.classList.add('landing-bg');
    return () => document.body.classList.remove('landing-bg');
  }, []);

  return (
    <div className="screen">
      <div className="landing-wrap">
        <div className="card landing-card">
          <div className="home-buttons">
            <button
              className="ghost-button small-button"
              onClick={() => {
                localStorage.setItem('role', 'host');
                navigate('/host');
              }}
            >
              Host
            </button>
            <button className="neon-button large-button" onClick={() => navigate('/join')}>
              Join
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
