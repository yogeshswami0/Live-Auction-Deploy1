import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
import './AuctionDashboard.css';
import { BACKEND_URL } from '../../config';

// const token = localStorage.getItem('token');
// const socket = io(BACKEND_URL, { auth: { token } });

const AuctionDashboard = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const socketRef = useRef(null);
    const [player, setPlayer] = useState(null);
    const [highestBid, setHighestBid] = useState(0);
    const [highestBidder, setHighestBidder] = useState('No bids yet');
    const [timer, setTimer] = useState(30);
    const [isActive, setIsActive] = useState(false);
    const [history, setHistory] = useState([]);
    const [eventName, setEventName] = useState('');
    const [viewers] = useState(0);
    const [ownerTeam, setOwnerTeam] = useState(() => {
        const raw = localStorage.getItem('team');
        return raw ? JSON.parse(raw) : null;
    });
    const [eventConfig, setEventConfig] = useState(null);
    const [bidToast, setBidToast] = useState(null);
    const [resultOverlay, setResultOverlay] = useState(null);
    const [playerStatus, setPlayerStatus] = useState(null);

    const user = JSON.parse(localStorage.getItem('user'));

    // Apply auction state when navigated from Admin "Start Auction" (with auction payload)
    useEffect(() => {
        const auction = location.state?.auction;
        if (auction && auction.currentPlayer) {
            setPlayer(auction.currentPlayer);
            setHighestBid(auction.highestBid ?? 0);
            setHighestBidder(auction.highestBidder ?? 'No bids yet');
            setTimer(auction.timer ?? 30);
            setHistory(Array.isArray(auction.bidHistory) ? auction.bidHistory : []);
            setIsActive(true);
            setEventName(auction.currentPlayer?.event?.name || '');
            navigate(location.pathname, { replace: true, state: {} });
            return;
        }
        // Start auction from Live Auction page when Admin navigates with startPlayerId
        const startPlayerId = location.state?.startPlayerId;
        const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
        if (startPlayerId && currentUser?.role === 'Admin') {
            navigate(location.pathname, { replace: true, state: {} });
            const playerIdToStart = startPlayerId;
            const emitStart = () => {
                if (socketRef.current) socketRef.current.emit("admin_start_auction", playerIdToStart);
            };
            if (socketRef.current?.connected) {
                emitStart();
            } else if (socketRef.current) {
                socketRef.current.once("connect", emitStart);
            } else {
                setTimeout(emitStart, 400);
            }
        }
    }, [location.state, location.pathname, navigate]);

useEffect(() => {
    if (!socketRef.current) {
        const token = localStorage.getItem("token");
        socketRef.current = io(BACKEND_URL, {
            auth: { token }
        });
    }

    const socket = socketRef.current;

    socket.emit("request_sync");

    socket.on("auction_started", (data) => {
        setPlayer(data.currentPlayer);
        setHighestBid(data.highestBid);
        setHighestBidder(data.highestBidder);
        setTimer(data.timer);
        setHistory(data.bidHistory);
        setIsActive(true);
        setEventName(data.currentPlayer?.event?.name || '');
    });

    socket.on("update_bid", (data) => {
        setHighestBid(data.highestBid);
        setHighestBidder(data.highestBidder);
        setTimer(data.timer);
        setHistory(data.bidHistory);
    });

    socket.on("timer_update", setTimer);

    socket.on("auction_result", (result) => {
        setIsActive(false);
        setPlayer(null);
        if (result.status === 'SKIPPED') {
            setResultOverlay({
                ...result,
                title: 'Skipped',
                message: `${result.player} was skipped.`
            });
        }
    });

    socket.on("bid_placed", setBidToast);
    socket.on("congratulations_trigger", (payload) => {
        const title = payload.status === 'SOLD' ? 'Congratulations!' : 'Unsold';
        const message = payload.status === 'SOLD'
            ? `${payload.player} sold to ${payload.team} for ₹${payload.price?.toLocaleString() ?? payload.price}`
            : `${payload.player} went unsold.`;
        setResultOverlay({ ...payload, title, message });
    });
    socket.on("error", (err) => {
        alert(err?.message || "Auction error");
    });

    return () => {
        socket.off("auction_started");
        socket.off("update_bid");
        socket.off("timer_update");
        socket.off("auction_result");
        socket.off("bid_placed");
        socket.off("congratulations_trigger");
        socket.off("error");
    };
}, []);

    useEffect(() => {
        const rawUser = localStorage.getItem('user');
        const authToken = localStorage.getItem('token');
        if (!rawUser || !authToken) return;
        const parsedUser = JSON.parse(rawUser);
        if (!parsedUser || parsedUser.role !== 'Owner') return;
        const fetchTeamAndEvent = async () => {
            try {
                const teamRes = await axios.get(`${BACKEND_URL}/api/teams/owner/${parsedUser.id}`, {
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                if (teamRes.data) {
                    setOwnerTeam(teamRes.data);
                    localStorage.setItem('team', JSON.stringify(teamRes.data));
                    if (teamRes.data.event) {
                        const eventRes = await axios.get(`${BACKEND_URL}/api/events/active`);
                        if (Array.isArray(eventRes.data) && eventRes.data.length > 0) {
                            const matchEvent = eventRes.data.find(e => e._id === String(teamRes.data.event));
                            setEventConfig(matchEvent || eventRes.data[0]);
                        }
                    }
                }
            } catch (err) {
                console.error('Error fetching owner team or event', err);
            }
        };
        fetchTeamAndEvent();
    }, []);

    useEffect(() => {
        const rawUser = localStorage.getItem('user');
        const authToken = localStorage.getItem('token');
        if (!rawUser || !authToken) return;
        const parsedUser = JSON.parse(rawUser);
        if (!parsedUser || parsedUser.role !== 'Player') return;
        const fetchPlayerStatus = async () => {
            try {
                const res = await axios.get(`${BACKEND_URL}/api/players/me`, {
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                setPlayerStatus(res.data.status || null);
            } catch (err) {
                setPlayerStatus(null);
            }
        };
        fetchPlayerStatus();
    }, []);

    const bidIncrements = [500000, 1000000, 2000000, 5000000, 10000000, 20000000];

    const handlePlaceBid = (increment) => {
        if (!ownerTeam) return alert("Only Team Owners with a registered team can bid!");
        const bidAmount = highestBid + increment;

        socketRef.current.emit("place_bid", {
            teamId: ownerTeam._id,
            teamName: ownerTeam.teamName,
            bidAmount: bidAmount
        });
    };

    const nextBidAmount = highestBid + 500000;
    let isBidDisabled = false;
    if (!user || user.role !== 'Owner') {
        isBidDisabled = true;
    } else if (!ownerTeam) {
        isBidDisabled = true;
    } else {
        if (typeof ownerTeam.remainingBudget === 'number' && ownerTeam.remainingBudget < nextBidAmount) {
            isBidDisabled = true;
        }
        if (!isBidDisabled && eventConfig && eventConfig.roleLimits && Array.isArray(ownerTeam.players) && player && player.role) {
            const hasRoleData = ownerTeam.players.length > 0 && typeof ownerTeam.players[0] === 'object' && ownerTeam.players[0] !== null && Object.prototype.hasOwnProperty.call(ownerTeam.players[0], 'role');
            if (hasRoleData) {
                const roleLimits = eventConfig.roleLimits;
                let roleLimit = null;
                if (player.role === 'Batsman') roleLimit = roleLimits.batsman;
                if (player.role === 'Bowler') roleLimit = roleLimits.bowler;
                if (player.role === 'All-Rounder') roleLimit = roleLimits.allRounder;
                if (player.role === 'Wicketkeeper') roleLimit = roleLimits.wicketkeeper;
                if (roleLimit && roleLimit > 0) {
                    const currentRoleCount = ownerTeam.players.filter(p => p.role === player.role).length;
                    if (currentRoleCount >= roleLimit) {
                        isBidDisabled = true;
                    }
                }
            }
        }
    }

    const handlePause = () => {
        socketRef.current?.emit("admin_pause_auction");
    };
    const handleResume = () => {
        socketRef.current?.emit("admin_resume_auction");
    };
    const handleSkipCurrent = () => {
        socketRef.current?.emit("admin_skip_current");
    };

    return (
        <div className="auction-root">
            {user?.role === 'Admin' && (
                <div className="auction-admin-bar">
                    <Link to="/admin" className="auction-admin-link">← Back to Admin</Link>
                    {isActive && (
                        <div className="auction-admin-controls">
                            <button type="button" className="auction-admin-btn pause" onClick={handlePause}>Pause</button>
                            <button type="button" className="auction-admin-btn resume" onClick={handleResume}>Resume</button>
                            <button type="button" className="auction-admin-btn skip" onClick={handleSkipCurrent}>Skip Player</button>
                        </div>
                    )}
                </div>
            )}
            {user && user.role === 'Player' && playerStatus && (
                <div className="player-status-strip">
                    <span className="player-status-label">My Auction Status</span>
                    <span className={`player-status-pill player-status-${playerStatus.toLowerCase()}`}>
                        {playerStatus}
                    </span>
                </div>
            )}
            {resultOverlay && (
                <div className={`auction-result-overlay ${resultOverlay.status === 'SOLD' ? 'overlay-sold' : resultOverlay.status === 'SKIPPED' ? 'overlay-skipped' : 'overlay-unsold'}`}>
                    <div className="auction-result-inner">
                        <h1>{resultOverlay.title}</h1>
                        <p>{resultOverlay.message}</p>
                        <button className="overlay-close-btn" onClick={() => setResultOverlay(null)}>
                            Close
                        </button>
                    </div>
                    {resultOverlay.status === 'SOLD' && (
                        <div className="confetti-layer">
                            {Array.from({ length: 40 }).map((_, index) => (
                                <span key={index} className="confetti-piece" />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {!isActive ? (
                <div className="auction-container">
                    <div className="glass-card auction-wait-card">
                        <span className="live-pill live-pill-idle">Live Room</span>
                        <h2>Waiting for the next player</h2>
                        <p className="auction-subtitle">
                            {user?.role === 'Admin'
                                ? 'Go to Admin → pick a player → click Start Auction to bring them to the block. You\'ll be taken here automatically.'
                                : 'Stay tuned. When admin starts an auction, this screen will update in real time.'}
                        </p>
                        {user?.role === 'Admin' && (
                            <Link to="/admin" className="auction-wait-cta">Open Admin Panel</Link>
                        )}
                    </div>
                </div>
            ) : (
                <div className="auction-main-layout">
                    {user?.role === 'Owner' && ownerTeam && (
                        <div className="auction-budget-strip">
                            <span className="auction-budget-label">Your budget</span>
                            <span className="auction-budget-value">₹{ownerTeam.remainingBudget?.toLocaleString() ?? 0}</span>
                            <span className="auction-budget-hint">Select your bid increment</span>
                        </div>
                    )}
                    <div className="auction-card-section">
                        <div className="player-card glass-card">
                            <span className="live-pill live-pill-active">LIVE</span>
                            <div className={`timer-badge ${timer <= 10 ? 'timer-urgent' : ''}`}>{timer}s</div>
                            <div className="auction-meta">
                                <span className="pill-badge pill-badge-primary">
                                    {eventName || 'Live Auction'}
                                </span>
                                {viewers > 0 && (
                                    <span className="pill-badge pill-badge-success">
                                        {viewers} viewing
                                    </span>
                                )}
                            </div>
                            <div className="player-header">
                                <div className="player-avatar">
                                    {player?.photo ? (
                                        <img src={player.photo} alt={player.name} />
                                    ) : (
                                        <div className="avatar-fallback">
                                            {player?.name ? player.name.charAt(0).toUpperCase() : '?'}
                                        </div>
                                    )}
                                </div>
                                <div className="player-text">
                                    <h2>{player?.name}</h2>
                                    <p className="player-role">{player?.role}</p>
                                    <div className="player-stats-row">
                                        <span>Matches: {player?.stats?.matches ?? 0}</span>
                                        <span>Runs: {player?.stats?.runs ?? 0}</span>
                                        <span>Wkts: {player?.stats?.wickets ?? 0}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="bid-info">
                                <h3>Current Bid: ₹{highestBid.toLocaleString()}</h3>
                                <p>Highest Bidder: <strong>{highestBidder}</strong></p>
                            </div>
                            {user?.role === 'Owner' && (
                                <div className="bid-buttons-container">
                                    {bidIncrements.map((increment, index) => {
                                        const bidAmount = highestBid + increment;
                                        let isDisabled = false;
                                        if (!user || user.role !== 'Owner') {
                                            isDisabled = true;
                                        } else if (!ownerTeam) {
                                            isDisabled = true;
                                        } else {
                                            if (typeof ownerTeam.remainingBudget === 'number' && ownerTeam.remainingBudget < bidAmount) {
                                                isDisabled = true;
                                            }
                                            if (!isDisabled && eventConfig && eventConfig.roleLimits && Array.isArray(ownerTeam.players) && player && player.role) {
                                                const hasRoleData = ownerTeam.players.length > 0 && typeof ownerTeam.players[0] === 'object' && ownerTeam.players[0] !== null && Object.prototype.hasOwnProperty.call(ownerTeam.players[0], 'role');
                                                if (hasRoleData) {
                                                    const roleLimits = eventConfig.roleLimits;
                                                    let roleLimit = null;
                                                    if (player.role === 'Batsman') roleLimit = roleLimits.batsman;
                                                    if (player.role === 'Bowler') roleLimit = roleLimits.bowler;
                                                    if (player.role === 'All-Rounder') roleLimit = roleLimits.allRounder;
                                                    if (player.role === 'Wicketkeeper') roleLimit = roleLimits.wicketkeeper;
                                                    if (roleLimit && roleLimit > 0) {
                                                        const currentRoleCount = ownerTeam.players.filter(p => p.role === player.role).length;
                                                        if (currentRoleCount >= roleLimit) {
                                                            isDisabled = true;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        const formatIncrement = (inc) => {
                                            if (inc >= 10000000) return `${inc / 10000000}Cr`;
                                            if (inc >= 100000) return `${inc / 100000}L`;
                                            return `₹${inc.toLocaleString()}`;
                                        };
                                        return (
                                            <button
                                                key={index}
                                                className="bid-btn"
                                                onClick={() => handlePlaceBid(increment)}
                                                disabled={isDisabled}
                                            >
                                                {isDisabled ? 'N/A' : `+${formatIncrement(increment)}`}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="history-section">
                        <h3>Live Bidding Log</h3>
                        <div className="history-list">
                            {history.map((bid, index) => (
                                <div key={index} className="history-item">
                                    <span className="history-time">{bid.time}</span>
                                    <span className="history-name">{bid.bidder}</span>
                                    <span className="history-amount">₹{bid.amount.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {bidToast && (
                <div className="bid-toast">
                    <span className="bid-toast-title">New Bid</span>
                    <p>{bidToast.teamName} has bid ₹{bidToast.amount.toLocaleString()}!</p>
                </div>
            )}
            </div>
    );
};

export default AuctionDashboard;
