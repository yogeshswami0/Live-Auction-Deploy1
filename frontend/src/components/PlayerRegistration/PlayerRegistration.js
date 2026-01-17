import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './PlayerRegistration.css';

const PlayerRegistration = () => {
    const token = localStorage.getItem('token');
    const userString = localStorage.getItem('user');
    const user = userString ? JSON.parse(userString) : null;

    const [formData, setFormData] = useState({
        name: '',
        age: '',
        role: 'Batsman',
        basePrice: '',
        runs: 0,
        wickets: 0,
        matches: 0,
        rating: 0,
        photo: ''
    });
    const [hasExistingProfile, setHasExistingProfile] = useState(false);
    const [status, setStatus] = useState('');

    useEffect(() => {
        const loadProfile = async () => {
            try {
                if (!token || !user || user.role !== 'Player') return;
                const res = await axios.get('BACKEND_URL/api/players/me', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const p = res.data;
                setFormData({
                    name: p.name || '',
                    age: p.age != null ? String(p.age) : '',
                    role: p.role || 'Batsman',
                    basePrice: p.basePrice != null ? String(p.basePrice) : '',
                    runs: p.stats?.runs ?? 0,
                    wickets: p.stats?.wickets ?? 0,
                    matches: p.stats?.matches ?? 0,
                    rating: p.stats?.rating ?? 0,
                    photo: p.photo || ''
                });
                setHasExistingProfile(true);
                setStatus(p.status || '');
            } catch (err) {
                setHasExistingProfile(false);
            }
        };
        loadProfile();
    }, [token, user]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (!token || !user || user.role !== 'Player') {
                alert('You must be logged in as a Player to register.');
                return;
            }
            const playerPayload = {
                name: formData.name,
                age: Number(formData.age),
                role: formData.role,
                basePrice: Number(formData.basePrice),
                photo: formData.photo,
                stats: {
                    matches: Number(formData.matches),
                    runs: Number(formData.runs),
                    wickets: Number(formData.wickets),
                    rating: Number(formData.rating)
                }
            };

            if (hasExistingProfile) {
                const res = await axios.put('BACKEND_URL/api/players/me', playerPayload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setStatus(res.data.status || '');
                alert("Profile updated successfully.");
            } else {
                await axios.post('BACKEND_URL/api/players/register', playerPayload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                alert("Profile submitted. Awaiting admin approval to enter auction pool.");
                setHasExistingProfile(true);
            }
        } catch (err) {
            alert("Error registering player: " + err.response?.data?.error);
        }
    };

    return (
        <div className="registration-container">
            <h2>{hasExistingProfile ? 'My Player Profile' : 'Player Registration'}</h2>
            {status && (
                <p className="profile-status-line">
                    Current Status: <strong>{status}</strong>
                </p>
            )}
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>Full Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} required />
                </div>

                <div className="form-group">
                    <label>Age</label>
                    <input type="number" name="age" value={formData.age} onChange={handleChange} required />
                </div>

                <div className="form-group">
                    <label>Role</label>
                    <select name="role" value={formData.role} onChange={handleChange}>
                        <option value="Batsman">Batsman</option>
                        <option value="Bowler">Bowler</option>
                        <option value="All-Rounder">All-Rounder</option>
                        <option value="Wicketkeeper">Wicketkeeper</option>
                    </select>
                </div>

                <div className="form-group">
                    <label>Base Price (₹)</label>
                    <input type="number" name="basePrice" value={formData.basePrice} onChange={handleChange} required />
                </div>

                <div className="stats-grid">
                    <div className="form-group">
                        <label>Matches</label>
                        <input type="number" name="matches" value={formData.matches} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                        <label>Total Runs</label>
                        <input type="number" name="runs" value={formData.runs} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                        <label>Rating</label>
                        <input type="number" name="rating" value={formData.rating} onChange={handleChange} />
                    </div>
                </div>

                <div className="form-group">
                    <label>Photo URL</label>
                    <input type="text" name="photo" placeholder="https://image-link.com" value={formData.photo} onChange={handleChange} />
                </div>

                <button type="submit" className="submit-btn">Register for Auction</button>
            </form>
        </div>
    );
};

export default PlayerRegistration;
