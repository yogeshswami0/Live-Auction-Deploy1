import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import './AdminPanel.css';

const token = localStorage.getItem('token');
const socket = io('BACKEND_URL', { auth: { token } });

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

    useEffect(() => {
        fetchPlayers();
        fetchEvents();
    });

    const fetchPlayers = async () => {
        try {
            const res = await axios.get('BACKEND_URL/api/admin/players', {
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
            const res = await axios.get('BACKEND_URL/api/events', {
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
            const res = await axios.get(`BACKEND_URL/api/events/${eventId}/matches`, {
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
                name: newEventName
            };
            if (newEventBudget) {
                payload.teamBudget = Number(newEventBudget);
            }
            if (newEventStart) {
                payload.startTime = newEventStart;
            }
            const res = await axios.post('BACKEND_URL/api/events', payload, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setEvents([res.data, ...events]);
            setNewEventName('');
            setNewEventBudget('');
            setNewEventStart('');
        } catch (err) {
            console.error("Error creating event", err);
        }
    };

    const activateEvent = async (eventId) => {
        try {
            const res = await axios.post(`BACKEND_URL/api/events/${eventId}/activate`, {}, {
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
            await axios.delete(`BACKEND_URL/api/events/${eventId}`, {
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
            const res = await axios.post(`BACKEND_URL/api/admin/players/${playerId}/approve`, {}, {
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
            const res = await axios.post(`BACKEND_URL/api/admin/players/${playerId}/reauction`, payload, {
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
                    <button onClick={createEvent}>Create Event</button>
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
