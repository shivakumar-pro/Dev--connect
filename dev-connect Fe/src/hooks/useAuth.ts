import { useAppDispatch, useAppSelector } from './storeHooks';
import { setCredentials, logout, setLoading } from '../store/authSlice';
import { apiClient } from '../services/apiClient';
import { useCallback } from 'react';

export const useAuth = () => {
  const dispatch = useAppDispatch();
  const { user, token, isAuthenticated, isLoading } = useAppSelector((state) => state.auth);

  const login = useCallback(async (credentials: any) => {
    dispatch(setLoading(true));
    try {
      const response = await apiClient.post('/auth/login', credentials);
      dispatch(setCredentials({ user: response.data.user, token: response.data.token }));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.message || 'Login failed' };
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch]);

  const register = useCallback(async (userData: any) => {
    dispatch(setLoading(true));
    try {
      const response = await apiClient.post('/auth/register', userData);
      dispatch(setCredentials({ user: response.data.user, token: response.data.token }));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.message || 'Registration failed' };
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch]);

  const performLogout = useCallback(() => {
    dispatch(logout());
  }, [dispatch]);

  return {
    user,
    token,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout: performLogout,
  };
};
