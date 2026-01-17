import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Leaderboard.css';

const Leaderboard = () => {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const res = await axios.get('BACKEND_URL/api/teams');
                // Sort teams by remaining budget or player count
                const sortedTeams = res.data.sort((a, b) => b.players.length - a.players.length);
                setTeams(sortedTeams);
                setLoading(false);
            } catch (err) {
                console.error("Error fetching leaderboard", err);
            }
        };
        fetchLeaderboard();
    }, []);

    if (loading) return <div className="leaderboard-container">Loading Stats...</div>;

    return (
        <div className="leaderboard-container">
            <div className="leaderboard-header">
                <h1>Auction Leaderboard</h1>
                <p>Real-time status of team budgets and squad depth</p>
            </div>

            <div className="stats-grid">
                {teams.map(team => {
                    const spendPercentage = ((team.budget - team.remainingBudget) / team.budget) * 100;
                    
                    return (
                        <div key={team._id} className="team-stat-card">
                            <div className="team-info">
                                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                    <h2>{team.teamName}</h2>
                                    <span className="player-count-badge">{team.players.length} Players</span>
                                </div>
                                
                                <div className="budget-bar-container">
                                    <div 
                                        className="budget-bar-fill" 
                                        style={{ width: `${spendPercentage}%`, backgroundColor: spendPercentage > 80 ? '#e74c3c' : '#27ae60' }}
                                    ></div>
                                </div>

                                <div className="card-details">
                                    <span>Spent: ₹{(team.budget - team.remainingBudget).toLocaleString()}</span>
                                    <span>Left: ₹{team.remainingBudget.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Leaderboard;