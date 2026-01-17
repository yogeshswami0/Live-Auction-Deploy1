import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import './UserRegistration.css';

const UserRegistration = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'Owner',
        teamName: '' // Added for owners
    });

    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // 1. Register the User
            const userRes = await axios.post('BACKEND_URL/api/register', {
                name: formData.name,
                email: formData.email,
                password: formData.password,
                role: formData.role
            });
            // 2. Auto-login the user to obtain token for subsequent actions
            const loginRes = await axios.post('BACKEND_URL/api/login', {
                email: formData.email,
                password: formData.password
            });

            // store token and user
            localStorage.setItem('token', loginRes.data.token);
            localStorage.setItem('user', JSON.stringify(loginRes.data.user));
            if (loginRes.data.team) localStorage.setItem('team', JSON.stringify(loginRes.data.team));

            // 3. If Owner and provided teamName, create team using authenticated endpoint
            if (formData.role === 'Owner' && formData.teamName) {
                try {
                    const token = loginRes.data.token;
                    const teamRes = await axios.post('BACKEND_URL/api/teams/register', { teamName: formData.teamName }, { headers: { Authorization: `Bearer ${token}` } });
                    localStorage.setItem('team', JSON.stringify(teamRes.data));
                } catch (teamErr) {
                    console.warn('Team creation failed after signup:', teamErr.response?.data || teamErr.message);
                }
            }

            // 4. If Player, redirect to Player registration form to complete profile
            if (formData.role === 'Player') {
                alert('Registration successful. Please complete your player profile.');
                navigate('/register-player');
                return;
            }

            alert('Registration successful and logged in.');
            navigate('/');
        } catch (err) {
            alert("Registration Failed: " + (err.response?.data?.error || "Server Error"));
        }
    };

    return (
        <div className="user-reg-container">
            <h2>Create Account</h2>
            <form className="user-reg-form" onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>Full Name</label>
                    <input type="text" name="name" placeholder="Enter Name" onChange={handleChange} required />
                </div>
                <div className="form-group">
                    <label>Email Address</label>
                    <input type="email" name="email" placeholder="Enter Email" onChange={handleChange} required />
                </div>
                <div className="form-group">
                    <label>Password</label>
                    <input type="password" name="password" placeholder="Create Password" onChange={handleChange} required />
                </div>
                <div className="form-group">
                    <label>Role</label>
                    <select name="role" value={formData.role} onChange={handleChange}>
                        <option value="Owner">Team Owner</option>
                        <option value="Player">Player</option>
                        <option value="Admin">Admin</option>
                    </select>
                </div>

                {formData.role === 'Owner' && (
                    <div className="form-group">
                        <label>Team Name</label>
                        <input 
                            type="text" 
                            name="teamName" 
                            placeholder="e.g. Mumbai Strikers" 
                            onChange={handleChange} 
                            required 
                        />
                    </div>
                )}

                <button type="submit" className="reg-submit-btn">Register</button>
            </form>
            <p className="login-link">
                Already have an account? <Link to="/login">Login here</Link>
            </p>
        </div>
    );
};

export default UserRegistration;