import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './AuctionDashboard.css';
import { BACKEND_URL } from '../../config';


const token = localStorage.getItem('token');
const socket = io(`${BACKEND_URL}`, { auth: { token } });   
const AuctionDashboard = () => {
    const [player, setPlayer] = useState(null);
    const [highestBid, setHighestBid] = useState(0);
    const [highestBidder, setHighestBidder] = useState('No bids yet');
    const [timer, setTimer] = useState(30);
    const [isActive, setIsActive] = useState(false);
    const [history, setHistory] = useState([]);
    const [eventName, setEventName] = useState('');
    const [viewers, setViewers] = useState(0);
    const [ownerTeam, setOwnerTeam] = useState(() => {
        const raw = localStorage.getItem('team');
        return raw ? JSON.parse(raw) : null;
    });
    const [eventConfig, setEventConfig] = useState(null);
    const [bidToast, setBidToast] = useState(null);
    const [resultOverlay, setResultOverlay] = useState(null);
    const [playerStatus, setPlayerStatus] = useState(null);

    // New states for dynamic increments and admin controls
    const [currentIncrement, setCurrentIncrement] = useState(500000);
    const [isPaused, setIsPaused] = useState(false);
    const [pauseOverlay, setPauseOverlay] = useState(null);
    const [isConnected, setIsConnected] = useState(true);

    const user = JSON.parse(localStorage.getItem('user'));

    useEffect(() => {
        // Connection status
        socket.on('connect', () => {
            setIsConnected(true);
            toast.success('Connected to auction server', { autoClose: 2000 });
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
            toast.error('Disconnected from server - Attempting to reconnect...', { autoClose: false });
        });

        socket.on('reconnect', () => {
            setIsConnected(true);
            toast.success('Reconnected successfully!', { autoClose: 2000 });
        });

        socket.on("auction_started", (data) => {
            setPlayer(data.currentPlayer);
            setHighestBid(data.highestBid);
            setHighestBidder(typeof data.highestBidder === 'object' ? data.highestBidder.teamName : data.highestBidder);
            setTimer(data.timer);
            setHistory(data.bidHistory);
            setIsActive(true);
            setIsPaused(false);
            setPauseOverlay(null);
            // Set current increment from server
            if (data.currentIncrement) {
                setCurrentIncrement(data.currentIncrement);
            }
            if (data.currentPlayer && data.currentPlayer.event && data.currentPlayer.event.name) {
                setEventName(data.currentPlayer.event.name);
            } else {
                setEventName('');
            }
        });

        socket.on("update_bid", (data) => {
            setHighestBid(data.highestBid);
            setHighestBidder(data.highestBidder);
            setTimer(data.timer);
            setHistory(data.bidHistory);
            // Update increment based on new highest bid
            if (data.nextIncrement) {
                setCurrentIncrement(data.nextIncrement);
            }
        });

        // Admin pause/resume/skip handlers
        socket.on("auction_paused", (data) => {
            setIsPaused(true);
            setPauseOverlay({
                message: "Auction Paused by Admin",
                remainingTime: data.remainingTime
            });
            toast.warning('Auction paused by admin', { autoClose: 3000 });
        });

        socket.on("auction_resumed", (data) => {
            setIsPaused(false);
            setPauseOverlay(null);
            toast.info('Auction resumed!', { autoClose: 2000 });
        });

        socket.on("player_skipped", (data) => {
            setIsActive(false);
            setPlayer(null);
            setIsPaused(false);
            setPauseOverlay(null);
            toast.info(`Player ${data.playerName} skipped - marked as Unsold`, { autoClose: 4000 });
            setResultOverlay({
                status: 'SKIPPED',
                title: 'Player Skipped',
                message: `${data.playerName} was skipped by admin and marked as Unsold`,
                player: data.playerName
            });
            setTimeout(() => setResultOverlay(null), 4000);
        });

        socket.on("timer_extended", (data) => {
            setTimer(data.newTimer);
            toast.info(`Timer extended by ${data.extensionSeconds} seconds`, { autoClose: 2000 });
        });

        socket.on("emergency_stop", (data) => {
            setIsActive(false);
            setPlayer(null);
            setIsPaused(false);
            setPauseOverlay(null);
            toast.error(data.message, { autoClose: 5000 });
            setResultOverlay({
                status: 'STOPPED',
                title: 'Auction Stopped',
                message: data.message,
                player: data.currentPlayer?.name || 'N/A'
            });
            setTimeout(() => setResultOverlay(null), 5000);
        });

        socket.on("bid_rejected", (data) => {
            toast.error(data.message || 'Bid rejected', { autoClose: 3000 });
        });

        socket.on("bid_confirmed", (data) => {
            toast.success(`Bid placed! ₹${data.bidAmount.toLocaleString('en-IN')}`, { autoClose: 2000 });
        });

        socket.on("error", (data) => {
            toast.error(data.message || 'An error occurred', { autoClose: 3000 });
        });

        socket.on("timer_update", (timeLeft) => setTimer(timeLeft));

        socket.on("auction_result", (result) => {
            setIsActive(false);
            setPlayer(null);
            if (result.status === 'UNSOLD') {
                const rawUser = localStorage.getItem('user');
                const parsedUser = rawUser ? JSON.parse(rawUser) : null;
                const userId = parsedUser ? parsedUser.id : null;
                const isPlayerSelf = parsedUser && parsedUser.role === 'Player' && result.playerUserId && result.playerUserId === userId;
                let title = 'Unsold';
                let message = `${result.player} is currently Unsold.`;
                if (isPlayerSelf) {
                    title = 'You are currently Unsold';
                    message = 'The auction for your profile has concluded. You are currently Unsold. Stay tuned for the re-entry round.';
                }
                setResultOverlay({
                    status: 'UNSOLD',
                    title,
                    message,
                    player: result.player
                });
            }
        });

        socket.on("viewer_count", (count) => {
            setViewers(count);
        });

        socket.on("bid_placed", (data) => {
            setBidToast({
                teamName: data.teamName,
                amount: data.amount
            });
            setTimeout(() => {
                setBidToast(null);
            }, 2200);
        });

        socket.on("congratulations_trigger", (payload) => {
            const rawUser = localStorage.getItem('user');
            const parsedUser = rawUser ? JSON.parse(rawUser) : null;
            const userId = parsedUser ? parsedUser.id : null;
            const isOwnerWinner = parsedUser && parsedUser.role === 'Owner' && payload.teamOwnerId && payload.teamOwnerId === userId;
            const isPlayerSelf = parsedUser && parsedUser.role === 'Player' && payload.playerUserId && payload.playerUserId === userId;
            let title = 'Player Sold';
            let message = `${payload.player} is sold to ${payload.team} for ₹${payload.price.toLocaleString()}.`;
            if (isOwnerWinner) {
                title = 'Congratulations!';
                message = `You have won ${payload.player} for ₹${payload.price.toLocaleString()}.`;
            } else if (isPlayerSelf) {
                title = 'You are Sold!';
                message = `You are sold to ${payload.team} for ₹${payload.price.toLocaleString()}.`;
            }
            setResultOverlay({
                status: 'SOLD',
                title,
                message,
                player: payload.player,
                team: payload.team,
                price: payload.price
            });
        });

        return () => {
            socket.off("connect");
            socket.off("disconnect");
            socket.off("reconnect");
            socket.off("auction_started");
            socket.off("update_bid");
            socket.off("timer_update");
            socket.off("auction_result");
            socket.off("viewer_count");
            socket.off("bid_placed");
            socket.off("congratulations_trigger");
            socket.off("auction_paused");
            socket.off("auction_resumed");
            socket.off("player_skipped");
            socket.off("timer_extended");
            socket.off("emergency_stop");
            socket.off("bid_rejected");
            socket.off("bid_confirmed");
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

    const handlePlaceBid = () => {
        if (!ownerTeam) return toast.error("Only Team Owners with a registered team can bid!");
        if (isPaused) return toast.warning("Bidding is paused by admin");
        const nextBid = highestBid + currentIncrement;

        socket.emit("place_bid", {
            teamId: ownerTeam._id,
            teamName: ownerTeam.teamName,
            bidAmount: nextBid
        });
    };

    const nextBidAmount = highestBid + currentIncrement;
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

    return (
        <div className="auction-root">
            {/* Toast Notifications */}
            <ToastContainer position="top-right" autoClose={3000} />

            {/* Connection Status Indicator */}
            <div style={{
                position: 'fixed',
                top: '20px',
                right: '20px',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 15px',
                borderRadius: '20px',
                background: isConnected ? '#28a745' : '#dc3545',
                color: 'white',
                fontSize: '14px',
                fontWeight: 'bold',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
            }}>
                <div style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: 'white',
                    animation: isConnected ? 'none' : 'pulse 1.5s ease-in-out infinite'
                }}></div>
                {isConnected ? 'Connected' : 'Disconnected'}
            </div>

            {/* Pause Overlay */}
            {isPaused && pauseOverlay && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(255, 193, 7, 0.9)',
                    zIndex: 9998,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    color: 'black'
                }}>
                    <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>⏸️ {pauseOverlay.message}</h1>
                    <p style={{ fontSize: '24px' }}>Time remaining when paused: {pauseOverlay.remainingTime}s</p>
                    <p style={{ fontSize: '18px', marginTop: '10px' }}>Please wait for admin to resume...</p>
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
                <div className={resultOverlay.status === 'SOLD' ? 'auction-result-overlay overlay-sold' : 'auction-result-overlay overlay-unsold'}>
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
                        <p className="pill-badge pill-badge-primary">Live Room</p>
                        <h2>Waiting for the next player to enter the arena</h2>
                        <p className="auction-subtitle">
                            Stay tuned. Admin will drop the next player card into the live stream any moment.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="auction-main-layout">
                    <div className="auction-card-section">
                        <div className="player-card glass-card">
                            <div className="timer-badge">{timer}s</div>
                            <div className="auction-meta">
                                <span className="pill-badge pill-badge-primary">
                                    {eventName || 'Live Auction Room'}
                                </span>
                                <span className="pill-badge pill-badge-success">
                                    {viewers} viewing
                                </span>
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
                                <>
                                    <button className="bid-btn" onClick={handlePlaceBid} disabled={isBidDisabled || isPaused}>
                                        {isPaused ? 'Paused by Admin' : (isBidDisabled ? 'Bid Not Available' : `Bid ₹${nextBidAmount.toLocaleString()}`)}
                                    </button>
                                    {!isBidDisabled && !isPaused && (
                                        <div style={{
                                            marginTop: '10px',
                                            fontSize: '14px',
                                            color: '#666',
                                            textAlign: 'center'
                                        }}>
                                            <div>Minimum bid: <strong>₹{nextBidAmount.toLocaleString('en-IN')}</strong></div>
                                            <div style={{ fontSize: '12px', color: '#999' }}>
                                                Increment: ₹{currentIncrement.toLocaleString('en-IN')}
                                            </div>
                                        </div>
                                    )}
                                </>
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
