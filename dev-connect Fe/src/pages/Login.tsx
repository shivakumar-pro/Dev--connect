import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Mail, Lock, ArrowRight, MessageSquare } from 'lucide-react';
import { AuthAPI } from '../services/api';
import { setCredentials } from '../store/authSlice';

export const Login = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await AuthAPI.login(formData);
      const loginData = res?.data || res;
      const accessToken = loginData.accessToken;

      localStorage.setItem('token', accessToken);
      dispatch(setCredentials({
        user: {
          id: String(loginData.userId),
          username: loginData.username,
          role: 'USER',
        },
        token: accessToken,
      }));
      navigate('/dashboard');
    } catch (error: any) {
      setErrorMsg(error?.response?.data?.message || 'Login failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-accent-purple/10 blur-[130px] z-0 pointer-events-none" />
      
      <div className="w-full max-w-[480px] z-10 py-10">
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-purple to-accent-orange flex justify-center items-center mb-6 shadow-glow cursor-pointer transition-transform hover:scale-105" onClick={() => navigate('/')}>
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-text-primary mb-2">Welcome Back</h1>
          <p className="text-text-secondary mt-2 text-center text-lg">Enter your credentials to access your account</p>
        </div>

        <form onSubmit={handleSubmit} className="glass p-10 py-12 rounded-3xl shadow-xl flex flex-col gap-8 border-border-color">
          {errorMsg && (
             <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-center font-medium">
               {errorMsg}
             </div>
          )}
          
          <Input 
            label="Email Address" 
            type="email" 
            placeholder="you@example.com" 
            icon={<Mail className="w-5 h-5" />}
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
            className="h-14"
          />
          
          <div className="flex flex-col gap-2">
            <Input 
              label="Password" 
              type="password" 
              placeholder="••••••••" 
              icon={<Lock className="w-5 h-5" />}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              className="h-14"
            />
            <div className="flex justify-end mt-2">
              <span className="text-sm font-medium text-accent-purple hover:text-accent-hover cursor-pointer transition-colors">Forgot password?</span>
            </div>
          </div>

          <Button type="submit" variant="primary" size="lg" className="w-full mt-4 h-14" isLoading={isLoading}>
            Sign In <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </form>

        <p className="text-center text-text-secondary mt-10 text-lg">
          Don't have an account?{' '}
          <span 
            onClick={() => navigate('/register')} 
            className="text-accent-orange hover:text-orange-400 font-bold cursor-pointer transition-colors"
          >
            Create one
          </span>
        </p>
      </div>
    </div>
  );
};
