import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './OwnerDashboard.css';

const OwnerDashboard = () => {
    const [team, setTeam] = useState(null);
    const [matches, setMatches] = useState([]);
    const [scoutingPlayers, setScoutingPlayers] = useState([]);
    const [loading, setLoading] = useState(true);

    const userString = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    const user = userString ? JSON.parse(userString) : null;
    const ownerId = user ? user.id : null;

    useEffect(() => {
        fetchTeamData();
    }, []);

    const fetchTeamData = async () => {
        try {
            if (!ownerId) return setLoading(false);
            const res = await axios.get(`BACKEND_URL/api/teams/owner/${ownerId}`, { headers: { Authorization: `Bearer ${token}` } });
            setTeam(res.data);
            if (res.data && res.data.event) {
                const matchesRes = await axios.get(`BACKEND_URL/api/events/${res.data.event}/matches`, { headers: { Authorization: `Bearer ${token}` } });
                setMatches(matchesRes.data);
                const playersRes = await axios.get(`BACKEND_URL/api/players?eventId=${res.data.event}`);
                setScoutingPlayers(playersRes.data);
            }
            setLoading(false);
        } catch (err) {
            console.error("Error fetching team", err);
            setLoading(false);
        }
    };

    const [creating, setCreating] = React.useState(false);
    const [newTeamName, setNewTeamName] = React.useState('');
    const [newTeamLogo, setNewTeamLogo] = React.useState('');

    const createTeam = async () => {
        if (!newTeamName) return alert('Enter team name');
        try {
            const payload = { teamName: newTeamName };
            if (newTeamLogo) payload.logo = newTeamLogo;
            const res = await axios.post('BACKEND_URL/api/teams/register', payload, { headers: { Authorization: `Bearer ${token}` } });
            setTeam(res.data);
            setCreating(false);
            localStorage.setItem('team', JSON.stringify(res.data));
            alert('Team created');
        } catch (err) {
            alert('Error creating team: ' + err.response?.data?.error);
        }
    };

    const categorizePlayers = (players) => {
        if (!Array.isArray(players) || players.length === 0) {
            return {
                Captain: [],
                Batsmen: [],
                Bowlers: [],
                AllRounders: [],
                Wicketkeepers: [],
                Extra: []
            };
        }
        let captainIndex = 0;
        let maxRating = -Infinity;
        players.forEach((player, index) => {
            const rating = player.stats && typeof player.stats.rating === 'number' ? player.stats.rating : 0;
            if (rating > maxRating) {
                maxRating = rating;
                captainIndex = index;
            }
        });
        const groups = {
            Captain: [],
            Batsmen: [],
            Bowlers: [],
            AllRounders: [],
            Wicketkeepers: [],
            Extra: []
        };
        players.forEach((player, index) => {
            if (index === captainIndex) {
                groups.Captain.push(player);
            } else if (player.role === 'Batsman') {
                groups.Batsmen.push(player);
            } else if (player.role === 'Bowler') {
                groups.Bowlers.push(player);
            } else if (player.role === 'All-Rounder') {
                groups.AllRounders.push(player);
            } else if (player.role === 'Wicketkeeper') {
                groups.Wicketkeepers.push(player);
            } else {
                groups.Extra.push(player);
            }
        });
        return groups;
    };

    if (loading) return <div>Loading Squad...</div>;
    if (!ownerId) return <div className="owner-container"><h2>Please login as a Team Owner to view this page.</h2></div>;
    if (!team) return (
        <div className="owner-container">
            <h2>No Team registered for this owner.</h2>
            {!creating ? (
                <button onClick={() => setCreating(true)}>Create Team</button>
            ) : (
                <div>
                    <input placeholder="Team Name" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} />
                    <input placeholder="Logo URL" value={newTeamLogo} onChange={e => setNewTeamLogo(e.target.value)} />
                    <button onClick={createTeam}>Create</button>
                    <button onClick={() => setCreating(false)}>Cancel</button>
                </div>
            )}
        </div>
    );

    const categorized = categorizePlayers(team.players || []);
    const totalSpent = typeof team.budget === 'number' && typeof team.remainingBudget === 'number'
        ? team.budget - team.remainingBudget
        : 0;

    return (
        <div className="owner-container">
            <div className="owner-header">
                <div className="owner-team-logo">
                    {team.logo ? (
                        <img src={team.logo} alt={team.teamName} />
                    ) : (
                        <div className="owner-logo-fallback">
                            {team.teamName ? team.teamName.charAt(0).toUpperCase() : '?'}
                        </div>
                    )}
                </div>
                <div>
                    <h1>{team.teamName}</h1>
                    <p className="owner-subtitle">Event squad overview and scouting room</p>
                </div>
            </div>
            
            <div className="owner-stats">
                <div className="stat-card">
                    <h3>Total Budget</h3>
                    <p>₹{team.budget.toLocaleString()}</p>
                </div>
                <div className="stat-card" style={{borderColor: '#e67e22'}}>
                    <h3>Remaining Budget</h3>
                    <p>₹{team.remainingBudget.toLocaleString()}</p>
                </div>
                <div className="stat-card" style={{borderColor: '#3b82f6'}}>
                    <h3>Amount Spent</h3>
                    <p>₹{totalSpent.toLocaleString()}</p>
                </div>
            </div>

            <h2>Your Squad ({team.players.length})</h2>
            <div className="squad-categories">
                {Object.entries(categorized).map(([label, players]) => (
                    players.length > 0 && (
                        <div key={label} className="squad-category">
                            <div className="squad-category-header">
                                <h3>{label}</h3>
                                <span className="pill-badge pill-badge-primary">{players.length}</span>
                            </div>
                            <div className="squad-grid">
                                {players.map(player => (
                                    <div key={player._id} className="player-mini-card">
                                        <h4>{player.name}</h4>
                                        <span>{player.role}</span>
                                        <strong style={{color: '#27ae60'}}>₹{player.currentPrice.toLocaleString()}</strong>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                ))}
            </div>

            {matches.length > 0 && (
                <>
                    <h2 style={{ marginTop: 32 }}>Match Schedule</h2>
                    <div className="matches-grid">
                        {matches
                            .filter(m => m.homeTeam && m.awayTeam && (m.homeTeam._id === team._id || m.awayTeam._id === team._id))
                            .map(match => {
                                const isHome = match.homeTeam._id === team._id;
                                const opponent = isHome ? match.awayTeam : match.homeTeam;
                                const date = new Date(match.startTime);
                                return (
                                    <div key={match._id} className="match-card">
                                        <div className="match-teams">
                                            <span>{team.teamName}</span>
                                            <span>vs</span>
                                            <span>{opponent.teamName}</span>
                                        </div>
                                        <div className="match-meta">
                                            <span>{date.toLocaleDateString()}</span>
                                            <span>{date.toLocaleTimeString()}</span>
                                            <span>{match.type}</span>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </>
            )}

            {scoutingPlayers.length > 0 && (
                <>
                    <h2 style={{ marginTop: 32 }}>Scouting Gallery</h2>
                    <p className="scouting-subtitle">Study player profiles and stats before they enter the live auction.</p>
                    <div className="scouting-grid">
                        {scoutingPlayers.map(player => (
                            <div key={player._id} className="scouting-card">
                                <div className="scouting-header">
                                    <div className="scouting-avatar">
                                        {player.photo ? (
                                            <img src={player.photo} alt={player.name} />
                                        ) : (
                                            <div className="scouting-avatar-fallback">
                                                {player.name ? player.name.charAt(0).toUpperCase() : '?'}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <h4>{player.name}</h4>
                                        <span className="scouting-role">{player.role}</span>
                                        <span className="scouting-base-price">Base ₹{player.basePrice.toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className="scouting-stats-row">
                                    <span>Matches: {player.stats?.matches ?? 0}</span>
                                    <span>Runs: {player.stats?.runs ?? 0}</span>
                                    <span>Wkts: {player.stats?.wickets ?? 0}</span>
                                    <span>Rating: {player.stats?.rating ?? 0}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default OwnerDashboard;
