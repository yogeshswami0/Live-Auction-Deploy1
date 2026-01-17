import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import './AuctionDashboard.css';

const token = localStorage.getItem('token');
const socket = io('BACKEND_URL', { auth: { token } });

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

    const user = JSON.parse(localStorage.getItem('user'));

    useEffect(() => {
        socket.on("auction_started", (data) => {
            setPlayer(data.currentPlayer);
            setHighestBid(data.highestBid);
            setHighestBidder(data.highestBidder);
            setTimer(data.timer);
            setHistory(data.bidHistory);
            setIsActive(true);
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
            socket.off("auction_started");
            socket.off("update_bid");
            socket.off("timer_update");
            socket.off("auction_result");
            socket.off("viewer_count");
            socket.off("bid_placed");
            socket.off("congratulations_trigger");
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
                const teamRes = await axios.get(`BACKEND_URL/api/teams/owner/${parsedUser.id}`, {
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                if (teamRes.data) {
                    setOwnerTeam(teamRes.data);
                    localStorage.setItem('team', JSON.stringify(teamRes.data));
                    if (teamRes.data.event) {
                        const eventRes = await axios.get('BACKEND_URL/api/events/active');
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
                const res = await axios.get('BACKEND_URL/api/players/me', {
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
        if (!ownerTeam) return alert("Only Team Owners with a registered team can bid!");
        const nextBid = highestBid + 500000;

        socket.emit("place_bid", {
            teamId: ownerTeam._id,
            teamName: ownerTeam.teamName,
            bidAmount: nextBid
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

    return (
        <div className="auction-root">
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
                                <button className="bid-btn" onClick={handlePlaceBid} disabled={isBidDisabled}>
                                    {isBidDisabled ? 'Bid Not Available' : `Bid ₹${nextBidAmount.toLocaleString()}`}
                                </button>
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
