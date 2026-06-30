import axios from 'axios';
import { supabase } from './supabaseClient';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/transport/';

export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor to inject JWT from Supabase session or local mock session
api.interceptors.request.use(async (config) => {
    const mockSessionStr = localStorage.getItem('mock_admin_session');
    if (mockSessionStr) {
        const mockSession = JSON.parse(mockSessionStr);
        config.headers.Authorization = `Bearer ${mockSession.access_token}`;
        return config;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});
