// Axios 공통 클라이언트 및 Authorization 인터셉터 설정
import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 60000,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('ecams_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 인증 만료 시 토큰 삭제 및 로그인으로 리디렉션 (콜백 경로 제외)
      if (!window.location.hash.includes('login') && !window.location.hash.includes('callback')) {
        localStorage.removeItem('ecams_token');
        localStorage.removeItem('ecams_user');
        window.location.hash = '#/login';
      }
    }
    return Promise.reject(error);
  }
);

export default client;
