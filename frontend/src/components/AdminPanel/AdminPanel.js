import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import './AdminPanel.css';
import { BACKEND_URL } from '../../config';

const token = localStorage.getItem('token');
const socket = io(`${BACKEND_URL}`, { auth: { token } });

const AdminPanel = () => {

    const [players, setPlayers] = useState([]);
    const [events, setEvents] = useState([]);
    const [newEventName, setNewEventName] = useState('');
    const [newEventBudget, setNewEventBudget] = useState('');
    const [newEventStart, setNewEventStart] = useState('');
    const [loading, setLoading] = useState(true);
    const [matches, setMatches] = useState([]);
    const [selectedEventId, setSelectedEventId] = useState(null);
    const [matchesLoading, setMatchesLoading] = useState(false);

    // Bid configuration states
    const [bidIncrement, setBidIncrement] = useState('500000');
    const [usePriceTiers, setUsePriceTiers] = useState(false);
    const [priceTiers, setPriceTiers] = useState([
        { minPrice: 0, maxPrice: 5000000, increment: 300000 },
        { minPrice: 5000000, maxPrice: 10000000, increment: 500000 },
        { minPrice: 10000000, maxPrice: 999999999, increment: 1000000 }
    ]);

    // Live auction control states
    const [auctionStatus, setAuctionStatus] = useState('idle'); // 'idle', 'running', 'paused'
    const [currentAuctionPlayer, setCurrentAuctionPlayer] = useState(null);
    const [currentTimer, setCurrentTimer] = useState(0);

    useEffect(() => {
        fetchPlayers();
        fetchEvents();

        // Socket listeners for live auction control
        socket.on('auction_started', (data) => {
            setAuctionStatus('running');
            setCurrentAuctionPlayer(data.currentPlayer);
            setCurrentTimer(data.timer);
        });

        socket.on('timer_update', (timer) => {
            setCurrentTimer(timer);
        });

        socket.on('auction_paused', (data) => {
            setAuctionStatus('paused');
            alert(`Auction paused with ${data.remainingTime}s remaining`);
        });

        socket.on('auction_resumed', (data) => {
            setAuctionStatus('running');
            alert('Auction resumed');
        });

        socket.on('player_skipped', (data) => {
            setAuctionStatus('idle');
            setCurrentAuctionPlayer(null);
            alert(`Player ${data.playerName} skipped and marked as Unsold`);
            fetchPlayers(); // Refresh player list
        });

        socket.on('timer_extended', (data) => {
            setCurrentTimer(data.newTimer);
            alert(`Timer extended by ${data.extensionSeconds} seconds`);
        });

        socket.on('emergency_stop', (data) => {
            setAuctionStatus('idle');
            setCurrentAuctionPlayer(null);
            alert(data.message);
        });

        socket.on('auction_ended', () => {
            setAuctionStatus('idle');
            setCurrentAuctionPlayer(null);
            setCurrentTimer(0);
            fetchPlayers(); // Refresh player list
        });

        return () => {
            socket.off('auction_started');
            socket.off('timer_update');
            socket.off('auction_paused');
            socket.off('auction_resumed');
            socket.off('player_skipped');
            socket.off('timer_extended');
            socket.off('emergency_stop');
            socket.off('auction_ended');
        };
    }, []); // Empty dependency array - run once on mount

    const fetchPlayers = async () => {
        try {
            const res = await axios.get(`${BACKEND_URL}/api/admin/players`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPlayers(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching players", err);
        }
    };

    const fetchEvents = async () => {
        try {
            const res = await axios.get(`${BACKEND_URL}/api/events`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setEvents(res.data);
            const active = res.data.find(e => e.isActive);
            if (active) {
                fetchMatches(active._id);
            }
        } catch (err) {
            console.error("Error fetching events", err);
        }
    };

    const fetchMatches = async (eventId) => {
        try {
            setMatchesLoading(true);
            setSelectedEventId(eventId);
            const res = await axios.get(`${BACKEND_URL}/api/events/${eventId}/matches`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMatches(res.data);
        } catch (err) {
            console.error("Error fetching matches", err);
        } finally {
            setMatchesLoading(false);
        }
    };

    const createEvent = async () => {
        if (!newEventName) return;
        try {
            const payload = {
                name: newEventName,
                bidIncrement: Number(bidIncrement),
                usePriceTiers,
                priceTiers: usePriceTiers ? priceTiers : []
            };
            if (newEventBudget) {
                payload.teamBudget = Number(newEventBudget);
            }
            if (newEventStart) {
                payload.startTime = newEventStart;
            }
            const res = await axios.post(`${BACKEND_URL}/api/events`, payload, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setEvents([res.data, ...events]);
            setNewEventName('');
            setNewEventBudget('');
            setNewEventStart('');
            alert('Event created successfully!');
        } catch (err) {
            console.error("Error creating event", err);
            alert(err.response?.data?.error || 'Error creating event');
        }
    };

    // Admin control functions
    const handlePauseAuction = () => {
        if (auctionStatus !== 'running') return;
        socket.emit('admin_pause_auction');
    };

    const handleResumeAuction = () => {
        if (auctionStatus !== 'paused') return;
        socket.emit('admin_resume_auction');
    };

    const handleSkipPlayer = () => {
        if (auctionStatus === 'idle') return;
        if (!window.confirm(`Skip ${currentAuctionPlayer?.name || 'this player'} and mark as Unsold?`)) return;
        socket.emit('admin_skip_player');
    };

    const handleExtendTimer = () => {
        if (auctionStatus !== 'running') return;
        socket.emit('admin_extend_timer', { extensionSeconds: 10 });
    };

    const handleEmergencyStop = () => {
        if (auctionStatus === 'idle') return;
        if (!window.confirm('EMERGENCY STOP will halt the auction immediately. Continue?')) return;
        socket.emit('admin_emergency_stop');
    };

    const addPriceTier = () => {
        setPriceTiers([...priceTiers, { minPrice: 0, maxPrice: 1000000, increment: 100000 }]);
    };

    const removePriceTier = (index) => {
        if (priceTiers.length <= 1) {
            alert('At least one price tier is required');
            return;
        }
        setPriceTiers(priceTiers.filter((_, i) => i !== index));
    };

    const updatePriceTier = (index, field, value) => {
        const updated = [...priceTiers];
        updated[index][field] = Number(value);
        setPriceTiers(updated);
    };

    const activateEvent = async (eventId) => {
        try {
            const res = await axios.post(`${BACKEND_URL}/api/events/${eventId}/activate`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setEvents(events.map(e => e._id === res.data._id ? res.data : { ...e, isActive: false }));
        } catch (err) {
            console.error("Error activating event", err);
        }
    };

    const deleteEvent = async (eventId) => {
        try {
            if (!window.confirm('Are you sure you want to delete this event?')) return;
            await axios.delete(`${BACKEND_URL}/api/events/${eventId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setEvents(events.filter(e => e._id !== eventId));
            alert('Event deleted');
        } catch (err) {
            console.error("Error deleting event", err);
            alert(err.response?.data?.error || 'Error deleting event');
        }
    };

    const startAuction = (playerId) => {
        socket.emit("admin_start_auction", playerId);
        alert("Auction started! Check the Live Dashboard.");
    };

    const approvePlayer = async (playerId) => {
        try {
            const res = await axios.post(`${BACKEND_URL}/api/admin/players/${playerId}/approve`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPlayers(players.map(p => p._id === playerId ? res.data : p));
        } catch (err) {
            console.error("Error approving player", err);
        }
    };

    const reauctionPlayer = async (playerId, currentBasePrice) => {
        try {
            const newPrice = window.prompt(
                'Enter new base price for Round 2 (leave blank to keep current)',
                currentBasePrice != null ? String(currentBasePrice) : ''
            );
            if (newPrice === null) return;
            const payload = {};
            if (newPrice.trim() !== '') {
                payload.basePrice = Number(newPrice);
            }
            const res = await axios.post(`${BACKEND_URL}/api/admin/players/${playerId}/reauction`, payload, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPlayers(players.map(p => p._id === playerId ? res.data : p));
        } catch (err) {
            console.error("Error re-auctioning player", err);
        }
    };

    if (loading) return <div>Loading Players...</div>;

    return (
        <div className="admin-container">
            <h2>Admin Control Panel</h2>
            <p>Manage events, verify players, and control live auctions.</p>

            {/* Live Auction Controls */}
            {auctionStatus !== 'idle' && (
                <div className="live-controls-section" style={{
                    background: auctionStatus === 'paused' ? '#fff3cd' : '#d1ecf1',
                    border: `2px solid ${auctionStatus === 'paused' ? '#ffc107' : '#17a2b8'}`,
                    padding: '20px',
                    borderRadius: '8px',
                    marginBottom: '20px'
                }}>
                    <h3>🔴 Live Auction Controls</h3>
                    <div style={{ marginBottom: '15px' }}>
                        <strong>Current Player:</strong> {currentAuctionPlayer?.name || 'N/A'}
                        <br />
                        <strong>Timer:</strong> {currentTimer}s
                        <br />
                        <strong>Status:</strong>
                        <span style={{
                            marginLeft: '10px',
                            padding: '5px 10px',
                            borderRadius: '5px',
                            background: auctionStatus === 'running' ? '#28a745' : '#ffc107',
                            color: 'white',
                            fontWeight: 'bold'
                        }}>
                            {auctionStatus.toUpperCase()}
                        </span>
                    </div>
                    <div className="control-buttons" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Primary Actions */}
                        {auctionStatus === 'running' && (
                            <button
                                onClick={handlePauseAuction}
                                style={{ background: '#ffc107', color: 'black', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                ⏸️ PAUSE AUCTION
                            </button>
                        )}
                        {auctionStatus === 'paused' && (
                            <button
                                onClick={handleResumeAuction}
                                style={{ background: '#28a745', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                ▶️ RESUME AUCTION
                            </button>
                        )}

                        {/* Player Management */}
                        <button
                            onClick={handleSkipPlayer}
                            style={{ background: '#6c757d', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            ⏭️ SKIP PLAYER
                        </button>

                        {/* Quick Settings */}
                        {auctionStatus === 'running' && (
                            <button
                                onClick={handleExtendTimer}
                                style={{ background: '#17a2b8', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                ⏱️ EXTEND +10s
                            </button>
                        )}

                        {/* Emergency */}
                        <button
                            onClick={handleEmergencyStop}
                            style={{ background: '#dc3545', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            🛑 EMERGENCY STOP
                        </button>
                    </div>
                </div>
            )}

            <div className="event-section">
                <h3>Events</h3>
                <div className="event-form">
                    <input
                        type="text"
                        placeholder="Event name e.g. IPL 2026"
                        value={newEventName}
                        onChange={e => setNewEventName(e.target.value)}
                    />
                    <input
                        type="number"
                        placeholder="Team budget"
                        value={newEventBudget}
                        onChange={e => setNewEventBudget(e.target.value)}
                    />
                    <input
                        type="datetime-local"
                        value={newEventStart}
                        onChange={e => setNewEventStart(e.target.value)}
                    />

                    {/* Bid Increment Configuration */}
                    <div style={{ marginTop: '15px', padding: '15px', background: '#f8f9fa', borderRadius: '5px' }}>
                        <h4>Bid Increment Configuration</h4>
                        <div style={{ marginBottom: '10px' }}>
                            <label>
                                <strong>Base Bid Increment (₹):</strong>
                                <input
                                    type="number"
                                    value={bidIncrement}
                                    onChange={e => setBidIncrement(e.target.value)}
                                    placeholder="500000"
                                    style={{ marginLeft: '10px', width: '150px' }}
                                />
                                <small style={{ marginLeft: '10px', color: '#666' }}>
                                    (₹{(Number(bidIncrement) / 100000).toFixed(2)} Lakhs)
                                </small>
                            </label>
                        </div>

                        <div style={{ marginBottom: '10px' }}>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={usePriceTiers}
                                    onChange={e => setUsePriceTiers(e.target.checked)}
                                />
                                <strong style={{ marginLeft: '5px' }}>Use Dynamic Price Tiers</strong>
                            </label>
                        </div>

                        {usePriceTiers && (
                            <div style={{ marginLeft: '20px' }}>
                                <p style={{ fontSize: '14px', color: '#666' }}>
                                    Define bid increments based on price ranges (e.g., lower increment for lower prices)
                                </p>
                                {priceTiers.map((tier, index) => (
                                    <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 'bold' }}>Tier {index + 1}:</span>
                                        <input
                                            type="number"
                                            placeholder="Min Price"
                                            value={tier.minPrice}
                                            onChange={e => updatePriceTier(index, 'minPrice', e.target.value)}
                                            style={{ width: '120px' }}
                                        />
                                        <span>to</span>
                                        <input
                                            type="number"
                                            placeholder="Max Price"
                                            value={tier.maxPrice}
                                            onChange={e => updatePriceTier(index, 'maxPrice', e.target.value)}
                                            style={{ width: '120px' }}
                                        />
                                        <span>=</span>
                                        <input
                                            type="number"
                                            placeholder="Increment"
                                            value={tier.increment}
                                            onChange={e => updatePriceTier(index, 'increment', e.target.value)}
                                            style={{ width: '120px' }}
                                        />
                                        <button
                                            onClick={() => removePriceTier(index)}
                                            style={{ background: '#dc3545', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '3px', cursor: 'pointer' }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={addPriceTier}
                                    style={{ background: '#28a745', color: 'white', border: 'none', padding: '5px 15px', borderRadius: '3px', cursor: 'pointer', marginTop: '5px' }}
                                >
                                    + Add Tier
                                </button>
                            </div>
                        )}
                    </div>

                    <button onClick={createEvent} style={{ marginTop: '15px' }}>Create Event</button>
                </div>
                <ul className="event-list">
                    {events.map(event => (
                        <li key={event._id}>
                            <span>{event.name}</span>
                            <div className="event-actions">
                                {event.isActive ? (
                                    <span className="active-badge">Active</span>
                                ) : (
                                    <button onClick={() => activateEvent(event._id)}>Set Active</button>
                                )}
                                <button onClick={() => fetchMatches(event._id)}>
                                    View Schedule
                                </button>
                                <button className="event-delete-btn" onClick={() => deleteEvent(event._id)}>
                                    Delete
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
            
            <div className="round2-section">
                <h3>Match Schedule</h3>
                {matchesLoading && <div>Loading schedule...</div>}
                {!matchesLoading && !selectedEventId && (
                    <p>Select an event to view its schedule.</p>
                )}
                {!matchesLoading && selectedEventId && matches.length === 0 && (
                    <p>No matches scheduled yet for this event.</p>
                )}
                {!matchesLoading && matches.length > 0 && (
                    <table className="player-list-table">
                        <thead>
                            <tr>
                                <th>Home Team</th>
                                <th>Away Team</th>
                                <th>Start Time</th>
                                <th>Type</th>
                            </tr>
                        </thead>
                        <tbody>
                            {matches.map(match => (
                                <tr key={match._id}>
                                    <td>{match.homeTeam?.teamName || 'TBD'}</td>
                                    <td>{match.awayTeam?.teamName || 'TBD'}</td>
                                    <td>{new Date(match.startTime).toLocaleString()}</td>
                                    <td>{match.type}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            
            <table className="player-list-table">
                <thead>
                    <tr>
                        <th>Player Name</th>
                        <th>Role</th>
                        <th>Base Price</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {players.map(player => (
                        <tr key={player._id}>
                            <td>{player.name}</td>
                            <td>{player.role}</td>
                            <td>₹{player.basePrice.toLocaleString()}</td>
                            <td>
                                <span className={`status-badge status-${player.status.toLowerCase()}`}>
                                    {player.status}
                                </span>
                            </td>
                            <td>
                                {player.status === 'Pending' && (
                                    <button
                                        className="approve-btn"
                                        onClick={() => approvePlayer(player._id)}
                                    >
                                        Approve
                                    </button>
                                )}
                                {player.status === 'Approved' && (
                                    <button
                                        className="start-btn"
                                        onClick={() => startAuction(player._id)}
                                    >
                                        Start Auction
                                    </button>
                                )}
                                {player.status === 'Unsold' && (
                                    <button
                                        className="reauction-btn"
                                        onClick={() => reauctionPlayer(player._id, player.basePrice)}
                                    >
                                        Re-auction (Round 2)
                                    </button>
                                )}
                                {player.status === 'Sold' && (
                                    <span>N/A</span>
                                )}
                                <button
                                    className="player-delete-btn"
                                    onClick={async () => {
                                        try {
                                            if (!window.confirm('Delete this player profile?')) return;
                                            await axios.delete(`${BACKEND_URL}/api/admin/players/${player._id}`, {
                                                headers: { Authorization: `Bearer ${token}` }
                                            });
                                            setPlayers(players.filter(p => p._id !== player._id));
                                            alert('Player deleted');
                                        } catch (err) {
                                            console.error("Error deleting player", err);
                                            alert(err.response?.data?.error || 'Error deleting player');
                                        }
                                    }}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="round2-section">
                <h3>Round 2 – Unsold Players</h3>
                <p>These players received no winning bids. You can reset their base price and send them back into the auction pool.</p>
                <table className="player-list-table">
                    <thead>
                        <tr>
                            <th>Player Name</th>
                            <th>Role</th>
                            <th>Base Price</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {players.filter(p => p.status === 'Unsold').map(player => (
                            <tr key={player._id}>
                                <td>{player.name}</td>
                                <td>{player.role}</td>
                                <td>₹{player.basePrice.toLocaleString()}</td>
                                <td>
                                    <span className="status-badge status-unsold">
                                        {player.status}
                                    </span>
                                </td>
                                <td>
                                    <button
                                        className="reauction-btn"
                                        onClick={() => reauctionPlayer(player._id, player.basePrice)}
                                    >
                                        Re-auction
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {players.filter(p => p.status === 'Unsold').length === 0 && (
                            <tr>
                                <td colSpan="5">No unsold players in this event.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminPanel;
