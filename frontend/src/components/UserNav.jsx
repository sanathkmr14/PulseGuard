import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const UserNav = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    if (!user) return null;

    return (
        <div className="user-nav" ref={dropdownRef}>
            <button
                className="user-nav-trigger"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="user-avatar">
                    {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <span className="user-name">{user.name}</span>
                <span className="dropdown-arrow">▼</span>
            </button>

            {isOpen && (
                <div className="dropdown-menu">
                    <div className="dropdown-header">
                        <div className="dropdown-user-name">{user.name}</div>
                        <div className="dropdown-user-email">{user.email}</div>
                    </div>
                    <div className="dropdown-divider"></div>
                    <Link
                        to="/app/profile"
                        className="dropdown-item"
                        onClick={() => setIsOpen(false)}
                    >
                        <span>👤</span> Profile
                    </Link>

                    <Link
                        to="/app/settings"
                        className="dropdown-item"
                        onClick={() => setIsOpen(false)}
                    >
                        <span>⚙️</span> Settings
                    </Link>
                    <div className="dropdown-divider"></div>
                    <button
                        onClick={handleLogout}
                        className="dropdown-item dropdown-item-danger"
                    >
                        <span>🚪</span> Logout
                    </button>
                </div>
            )}
        </div>
    );
};

export default UserNav;
