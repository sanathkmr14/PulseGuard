const API_URL = import.meta.env.VITE_API_URL || '/api';

export default {
    API_URL,
    HEADERS: {
        'Content-Type': 'application/json'
    }
};

