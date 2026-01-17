import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './PlayersList.css';

const PlayersList = () => {
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPlayers = async () => {
            try {
                const res = await axios.get('BACKEND_URL/api/players');
                setPlayers(res.data);
                setLoading(false);
            } catch (err) {
                console.error('Error fetching players', err);
                setLoading(false);
            }
        };
        fetchPlayers();
    }, []);

    if (loading) return <div className="players-list-container">Loading players...</div>;

    return (
        <div className="players-list-container">
            <h2>Registered Players</h2>
            <div className="players-grid">
                {players.map(p => (
                    <div key={p._id} className="player-card">
                        <img src={p.photo || '/placeholder.png'} alt={p.name} />
                        <h3>{p.name}</h3>
                        <p>{p.role}</p>
                        <p>Base: ₹{p.basePrice.toLocaleString()}</p>
                        <p>Status: {p.status}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PlayersList;
