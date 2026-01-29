import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Login.css';
// 1. Corrected the import to bring in the variable from your config
import { BACKEND_URL } from '../../config'; 

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        try {
            // 2. Used Template Literals (backticks) to inject the actual URL
            const res = await axios.post(`${BACKEND_URL}/api/login`, { email, password });
            
            // 3. Store data securely
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            
            if (res.data.team) {
                localStorage.setItem('team', JSON.stringify(res.data.team));
            }

            alert("Logged in successfully!");
            
            // 4. Role-based navigation
            if (res.data.user.role === 'Admin') {
                navigate('/admin');
            } else if (res.data.user.role === 'Owner') {
                navigate('/owner-squad');
            } else {
                navigate('/');
            }
            
        } catch (err) {
            // 5. Improved error handling to catch "Network Errors"
            const message = err.response?.data?.error || "Connection refused. Is the backend running?";
            alert("Login failed: " + message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-box card-shadow">
                <h2>Login</h2>
                <form className="login-form" onSubmit={handleLogin}>
                    <input 
                        type="email" 
                        placeholder="Email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)} 
                        required 
                    />
                    <input 
                        type="password" 
                        placeholder="Password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                    />
                    <button type="submit" className="login-btn" disabled={loading}>
                        {loading ? "Authenticating..." : "Login"}
                    </button>
                </form>
                <p className="register-link">
                    Don't have an account? <span onClick={() => navigate('/signup')}>Register here</span>
                </p>
            </div>
        </div>
    );
};

export default Login;