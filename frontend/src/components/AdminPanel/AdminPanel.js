import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import './AdminPanel.css';
import { BACKEND_URL } from '../../config';

// const token = localStorage.getItem('token');
// const socket = io(BACKEND_URL, { auth: { token } });

const AdminPanel = () => {
    const socketRef = useRef(null);
    const token = localStorage.getItem('token');

    const navigate = useNavigate();
    const [players, setPlayers] = useState([]);
    const [events, setEvents] = useState([]);
    const [newEventName, setNewEventName] = useState('');
    const [newEventBudget, setNewEventBudget] = useState('');
    const [newEventStart, setNewEventStart] = useState('');
    const [loading, setLoading] = useState(true);
    const [matches, setMatches] = useState([]);
    const [selectedEventId, setSelectedEventId] = useState(null);
    const [matchesLoading, setMatchesLoading] = useState(false);
    const [filterRole, setFilterRole] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    const fetchPlayers = useCallback(async (eventId) => {
        try {
            const url = eventId
                ? `${BACKEND_URL}/api/admin/players?eventId=${eventId}`
                : `${BACKEND_URL}/api/admin/players`;
            const res = await axios.get(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPlayers(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching players", err);
        }
    }, [token]);

    const fetchMatches = useCallback(async (eventId) => {
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
    }, [token]);

    const fetchEvents = useCallback(async () => {
        try {
            const res = await axios.get(`${BACKEND_URL}/api/events`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setEvents(res.data);
            const active = res.data.find(e => e.isActive);
            if (active) {
                fetchMatches(active._id);
                fetchPlayers(active._id);
            } else {
                fetchPlayers();
            }
        } catch (err) {
            console.error("Error fetching events", err);
        }
    }, [fetchMatches, fetchPlayers, token]);

useEffect(() => {
    if (!socketRef.current) {
        const token = localStorage.getItem("token");
        socketRef.current = io(BACKEND_URL, {
            auth: { token }
        });
    }

    fetchEvents();
    return () => {
        socketRef.current?.disconnect();
    };
}, [fetchEvents]);


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
            const res = await axios.post(`${BACKEND_URL}/api/events`, payload, {
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
            const res = await axios.post(`${BACKEND_URL}/api/events/${eventId}/activate`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setEvents(events.map(e => e._id === res.data._id ? res.data : { ...e, isActive: false }));
            fetchPlayers(res.data._id);
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
    if (!activeEvent) {
        alert("Set an event as Active first.");
        return;
    }
    navigate("/", { state: { startPlayerId: playerId } });
};


const pauseAuction = () => {
    socketRef.current.emit("admin_pause_auction");
};

const resumeAuction = () => {
    socketRef.current.emit("admin_resume_auction");
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

    const skipPlayer = async (playerId) => {
        try {
            const res = await axios.post(`${BACKEND_URL}/api/admin/players/${playerId}/skip`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPlayers(players.map(p => p._id === playerId ? res.data : p));
        } catch (err) {
            console.error("Error skipping player", err);
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

    const activeEvent = events.find(e => e.isActive);

    const filteredPlayers = players.filter(p => {
        if (filterRole && p.role !== filterRole) return false;
        if (filterStatus && p.status !== filterStatus) return false;
        return true;
    });

    if (loading) return <div className="admin-loading">Loading players…</div>;

    return (
        <div className="admin-panel-root max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-screen">
            <div className="admin-panel-header">
                <h1 className="admin-panel-title">Admin Control Panel</h1>
                <p className="admin-panel-subtitle">Manage events, verify players, and run the live auction.</p>
                <div className="admin-steps">
                    <span className={`admin-step ${activeEvent ? 'done' : 'current'}`}>1. Events</span>
                    <span className="admin-step-divider">→</span>
                    <span className={`admin-step ${activeEvent ? 'current' : ''}`}>2. Players</span>
                    <span className="admin-step-divider">→</span>
                    <span className="admin-step">3. Live Auction</span>
                </div>

                <div className="admin-controls mt-4">
                    <button
                        onClick={pauseAuction}
                        disabled={!activeEvent}
                        className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 text-sm mr-2"
                        title={!activeEvent ? 'Set an event as Active first' : 'Pause live auction'}
                    >
                        Pause Auction
                    </button>
                    <button
                        onClick={resumeAuction}
                        disabled={!activeEvent}
                        className="px-3 py-1 bg-green-100 text-green-800 rounded-lg hover:bg-green-200 text-sm"
                        title={!activeEvent ? 'Set an event as Active first' : 'Resume live auction'}
                    >
                        Resume Auction
                    </button>
                </div>
            </div>

            {!activeEvent && events.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-amber-800">
                    <strong>No active event.</strong> Set an event as Active to run auctions. Click &quot;Set Active&quot; on an event below, then you can start auctions on players and control the live auction from the Auction page.
                </div>
            )}
            {events.length === 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-blue-800">
                    <strong>Create an event first.</strong> Add an event below and set it as Active. Then add players (they register from Player Profile) and approve them. After that, you can start auctions from this panel and control them on the Live Auction page.
                </div>
            )}

            <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">Events</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
                    <button onClick={createEvent} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition">Create Event</button>
                </div>
                <ul className="space-y-3">
                    {events.map(event => (
                        <li key={event._id} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <span className="font-medium text-gray-800">{event.name}</span>
                            <div className="flex space-x-2">
                                {event.isActive ? (
                                    <div className="flex items-center space-x-2">
                                        <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">Active</span>
                                        <Link to="/" className="admin-link-live">Go to Live Auction</Link>
                                    </div>
                                ) : (
                                    <button onClick={() => activateEvent(event._id)} className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm">Set Active</button>
                                )}
                                <button onClick={() => fetchMatches(event._id)} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm">
                                    View Schedule
                                </button>
                                <button className="px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm" onClick={() => deleteEvent(event._id)}>
                                    Delete
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
            
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">Match Schedule</h3>
                {matchesLoading && <div>Loading schedule...</div>}
                {!matchesLoading && !selectedEventId && (
                    <p>Select an event to view its schedule.</p>
                )}
                {!matchesLoading && selectedEventId && matches.length === 0 && (
                    <p>No matches scheduled yet for this event.</p>
                )}
                {!matchesLoading && matches.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Home Team</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Away Team</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Time</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {matches.map(match => (
                                    <tr key={match._id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{match.homeTeam?.teamName || 'TBD'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{match.awayTeam?.teamName || 'TBD'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(match.startTime).toLocaleString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{match.type}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">All Players</h3>
                <div className="admin-filters">
                    <div className="admin-filter-group">
                        <label className="admin-filter-label">Role</label>
                        <select
                            value={filterRole}
                            onChange={e => setFilterRole(e.target.value)}
                            className="admin-filter-select"
                        >
                            <option value="">All</option>
                            <option value="Batsman">Batsman</option>
                            <option value="Bowler">Bowler</option>
                            <option value="All-Rounder">All-Rounder</option>
                            <option value="Wicketkeeper">Wicketkeeper</option>
                        </select>
                    </div>
                    <div className="admin-filter-group">
                        <label className="admin-filter-label">Status</label>
                        <select
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value)}
                            className="admin-filter-select"
                        >
                            <option value="">All</option>
                            <option value="Pending">Pending</option>
                            <option value="Approved">Approved</option>
                            <option value="Sold">Sold</option>
                            <option value="Unsold">Unsold</option>
                            <option value="Skipped">Skipped</option>
                        </select>
                    </div>
                    <span className="admin-filter-count">{filteredPlayers.length} player{filteredPlayers.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base Price</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredPlayers.map(player => (
                                <tr key={player._id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{player.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{player.role}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">₹{player.basePrice.toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                            ${player.status === 'Sold' ? 'bg-green-100 text-green-800' : 
                                              player.status === 'Unsold' ? 'bg-red-100 text-red-800' : 
                                              player.status === 'Skipped' ? 'bg-gray-100 text-gray-800' : 
                                              player.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : 
                                              'bg-blue-100 text-blue-800'}`}>
                                            {player.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                        {player.status === 'Pending' && (
                                            <button
                                                className="text-green-600 hover:text-green-900"
                                                onClick={() => approvePlayer(player._id)}
                                            >
                                                Approve
                                            </button>
                                        )}
                                        {player.status === 'Approved' && (
                                            <>
                                                <button
                                                    className="admin-btn-start-auction"
                                                    onClick={() => startAuction(player._id)}
                                                    disabled={!activeEvent}
                                                    title={!activeEvent ? 'Set an event as Active first' : 'Opens Live Auction page'}
                                                >
                                                    ▶ Start Auction
                                                </button>
                                                <button
                                                    className="admin-btn-skip"
                                                    onClick={() => skipPlayer(player._id)}
                                                >
                                                    Skip
                                                </button>
                                            </>
                                        )}
                                        {player.status === 'Unsold' && (
                                            <button
                                                className="text-orange-600 hover:text-orange-900"
                                                onClick={() => reauctionPlayer(player._id, player.basePrice)}
                                            >
                                                Re-auction
                                            </button>
                                        )}
                                        <button
                                            className="text-red-600 hover:text-red-900 ml-2"
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
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Round 2 – Unsold Players</h3>
                <p className="text-gray-600 mb-4">These players received no winning bids. You can reset their base price and send them back into the auction pool.</p>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base Price</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {players.filter(p => p.status === 'Unsold').map(player => (
                                <tr key={player._id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{player.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{player.role}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">₹{player.basePrice.toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                                            {player.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <button
                                            className="text-indigo-600 hover:text-indigo-900"
                                            onClick={() => reauctionPlayer(player._id, player.basePrice)}
                                        >
                                            Re-auction
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {players.filter(p => p.status === 'Unsold').length === 0 && (
                                <tr>
                                    <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">No unsold players in this event.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;
