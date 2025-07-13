import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

export const api = {
    //incription 
    register: async (username, email, password) => {
        const response = await axios.post(`${API_BASE_URL}/register`, {
            username,
            email,
            password
        });
        return response.data;
    },

    //connexion
    login: async (username,password) => {
        const response = await axios.post(`${API_BASE_URL}/login`, {
            username,
            password
        });
        return response.data;
    }
};