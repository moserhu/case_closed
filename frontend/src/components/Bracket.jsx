// frontend/src/components/Bracket.jsx
import React, { useMemo, useState } from 'react';
import '../styles/BracketScreen.css';

function buildRounds(round1, battleWinners) {
  const rounds = [];
  const hydratedRound1 = round1.map((match) => {
    const key = `${match.item1}||${match.item2}`;
    const winner = battleWinners[key] || match.winner || null;
    if (!winner && match.item2 === 'BYE' && match.item1) {
      return { ...match, winner: match.item1 };
    }
    if (!winner && match.item1 === 'BYE' && match.item2) {
      return { ...match, winner: match.item2 };
    }
    return { ...match, winner };
  });
  rounds.push(hydratedRound1);

  let current = hydratedRound1;
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = current[i + 1];
      let item1 = left?.winner || null;
      let item2 = right?.winner || null;
      const key = item1 && item2 ? `${item1}||${item2}` : null;
      let winner = key ? (battleWinners[key] || null) : null;
      if (!winner && item1 && !item2) {
        winner = item1;
      }
      if (!winner && item2 && !item1) {
        winner = item2;
      }
      next.push({
        seed1: left?.seed1 ?? null,
        item1,
        seed2: right?.seed1 ?? null,
        item2,
        winner,
      });
    }
    rounds.push(next);
    current = next;
  }

  return rounds;
}

function splitSides(round1, battleWinners) {
  const mid = Math.ceil(round1.length / 2);
  const left = round1.slice(0, mid);
  const right = round1.slice(mid);

  return {
    leftRounds: buildRounds(left, battleWinners),
    rightRounds: buildRounds(right, battleWinners),
  };
}

export default function Bracket({ bracket, onStartBattle, battleWinners, champion }) {
  const [currentBattle, setCurrentBattle] = useState(null);
  const { leftRounds, rightRounds } = useMemo(
    () => splitSides(bracket, battleWinners || {}),
    [bracket, battleWinners]
  );

  const finalMatch = useMemo(() => {
    const leftFinal = leftRounds[leftRounds.length - 1]?.[0];
    const rightFinal = rightRounds[rightRounds.length - 1]?.[0];
    if (!leftFinal && !rightFinal) return null;
    const item1 = leftFinal?.winner || null;
    const item2 = rightFinal?.winner || null;
    return {
      seed1: leftFinal?.seed1 ?? null,
      item1,
      seed2: rightFinal?.seed1 ?? null,
      item2,
      winner: champion || null,
    };
  }, [leftRounds, rightRounds, champion]);

  const handleStartBattle = (match) => {
    if (!match.item1 || !match.item2 || match.item2 === 'BYE') return;
    if (match.winner) return;
    console.log('Starting battle between:', match.item1, 'vs', match.item2);
    setCurrentBattle(match);

    onStartBattle(match); // 🛠 Call the prop here!
  };

  return (
    <div className="bracket-container">
      {champion && (
        <div className="champion-wrap">
          <div className="champion-label">Winner</div>
          <button className="champion-button" type="button">
            {champion}
          </button>
        </div>
      )}
      <div className="bracket-sides">
        <div className="side left">
          {leftRounds.map((round, roundIdx) => (
            <div key={`left-round-${roundIdx}`} className="round">
              <h4>Round {roundIdx + 1}</h4>
              {round.map((match, idx) => (
                <div
                  key={`left-${roundIdx}-${idx}`}
                  className={`matchup ${currentBattle === match ? 'current-battle' : ''} ${match.winner ? 'resolved' : ''}`}
                  onClick={() => handleStartBattle(match)}
                >
                  <div className={`seed-item ${match.winner && match.item1 && match.item2 && match.item1 !== 'BYE' && match.item2 !== 'BYE' && match.winner === match.item1 ? 'winner' : ''}`}>
                    {match.seed1 ? `${match.seed1}.` : ''} {match.item1 || 'TBD'}
                  </div>
                  <span className="vs">vs</span>
                  <div className={`seed-item ${match.winner && match.item1 && match.item2 && match.item1 !== 'BYE' && match.item2 !== 'BYE' && match.winner === match.item2 ? 'winner' : ''}`}>
                    {match.seed2 ? `${match.seed2}.` : ''} {match.item2 || 'TBD'}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="side center">
          <div className="round final-round">
            <h4>Final</h4>
            {finalMatch ? (
              <div
                className={`matchup ${finalMatch.winner ? 'resolved' : ''}`}
                onClick={() => {
                  if (finalMatch.item1 && finalMatch.item2 && !finalMatch.winner) {
                    handleStartBattle(finalMatch);
                  }
                }}
              >
                <div className={`seed-item ${finalMatch.winner && finalMatch.item1 && finalMatch.item2 && finalMatch.item1 !== 'BYE' && finalMatch.item2 !== 'BYE' && finalMatch.winner === finalMatch.item1 ? 'winner' : ''}`}>
                  {finalMatch.seed1 ? `${finalMatch.seed1}.` : ''} {finalMatch.item1 || 'TBD'}
                </div>
                <span className="vs">vs</span>
                <div className={`seed-item ${finalMatch.winner && finalMatch.item1 && finalMatch.item2 && finalMatch.item1 !== 'BYE' && finalMatch.item2 !== 'BYE' && finalMatch.winner === finalMatch.item2 ? 'winner' : ''}`}>
                  {finalMatch.seed2 ? `${finalMatch.seed2}.` : ''} {finalMatch.item2 || 'TBD'}
                </div>
              </div>
            ) : (
              <div className="muted">Waiting for finalists…</div>
            )}
          </div>
        </div>

        <div className="side right">
          {[...rightRounds].reverse().map((round, roundIdx) => (
            <div key={`right-round-${roundIdx}`} className="round">
              <h4>Round {rightRounds.length - roundIdx}</h4>
              {round.map((match, idx) => (
                <div
                  key={`right-${roundIdx}-${idx}`}
                  className={`matchup ${currentBattle === match ? 'current-battle' : ''} ${match.winner ? 'resolved' : ''}`}
                  onClick={() => handleStartBattle(match)}
                >
                  <div className={`seed-item ${match.winner && match.item1 && match.item2 && match.item1 !== 'BYE' && match.item2 !== 'BYE' && match.winner === match.item2 ? 'winner' : ''}`}>
                    {match.seed2 ? `${match.seed2}.` : ''} {match.item2 || 'TBD'}
                  </div>
                  <span className="vs">vs</span>
                  <div className={`seed-item ${match.winner && match.item1 && match.item2 && match.item1 !== 'BYE' && match.item2 !== 'BYE' && match.winner === match.item1 ? 'winner' : ''}`}>
                    {match.seed1 ? `${match.seed1}.` : ''} {match.item1 || 'TBD'}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
