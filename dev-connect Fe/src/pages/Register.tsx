import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Mail, Lock, User, MessageSquare, Check, AlertCircle, Loader2 } from 'lucide-react';
import { AuthAPI, UserAPI } from '../services/api';

type FieldStatus = 'idle' | 'checking' | 'available' | 'taken';

export const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<FieldStatus>('idle');
  const [emailStatus, setEmailStatus] = useState<FieldStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const checkUsername = (value: string) => {
    if (value.length < 2) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await UserAPI.checkUsername(value);
        setUsernameStatus((res.data?.taken ?? res.taken) ? 'taken' : 'available');
      } catch { setUsernameStatus('idle'); }
    }, 500);
  };

  const checkEmail = (value: string) => {
    if (value.length < 5 || !value.includes('@')) { setEmailStatus('idle'); return; }
    setEmailStatus('checking');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await UserAPI.checkEmail(value);
        setEmailStatus((res.data?.taken ?? res.taken) ? 'taken' : 'available');
      } catch { setEmailStatus('idle'); }
    }, 500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }
    if (usernameStatus === 'taken' || emailStatus === 'taken') {
      setErrorMsg('Please fix the issues above');
      return;
    }
    setErrorMsg('');
    setIsLoading(true);

    try {
      await AuthAPI.register({
        username: formData.username,
        email: formData.email,
        password: formData.password
      });
      setSuccessMsg('Registration successful! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (error: any) {
      setErrorMsg(error?.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const StatusIndicator = ({ status }: { status: FieldStatus }) => {
    if (status === 'checking') return <Loader2 className="w-4 h-4 animate-spin text-text-muted" />;
    if (status === 'available') return <Check className="w-4 h-4 text-green-500" />;
    if (status === 'taken') return <AlertCircle className="w-4 h-4 text-red-500" />;
    return null;
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-accent-orange/10 blur-[130px] z-0 pointer-events-none" />

      <div className="w-full max-w-[500px] z-10 py-10">
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-purple to-accent-orange flex justify-center items-center mb-6 shadow-glow cursor-pointer transition-transform hover:scale-105" onClick={() => navigate('/')}>
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-text-primary mb-2">Create Account</h1>
          <p className="text-text-secondary mt-2 text-center text-lg">Join DevConnect and start collaborating</p>
        </div>

        <form onSubmit={handleSubmit} className="glass p-10 py-12 rounded-3xl shadow-xl flex flex-col gap-6 border-border-color">
          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 font-medium p-4 rounded-xl text-center">{errorMsg}</div>
          )}
          {successMsg && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 font-medium p-4 rounded-xl text-center">{successMsg}</div>
          )}

          <div className="flex flex-col gap-5">
            {/* Username */}
            <div>
              <Input
                label="Username"
                placeholder="johndoe"
                icon={<User className="w-5 h-5" />}
                value={formData.username}
                onChange={(e) => { setFormData({ ...formData, username: e.target.value }); checkUsername(e.target.value); }}
                required
                className="h-14"
              />
              <div className="flex items-center gap-1.5 mt-1.5 min-h-[20px] px-1">
                <StatusIndicator status={usernameStatus} />
                {usernameStatus === 'available' && <span className="text-xs text-green-500 font-medium">Available!</span>}
                {usernameStatus === 'taken' && <span className="text-xs text-red-400 font-medium">Username already taken</span>}
              </div>
            </div>

            {/* Email */}
            <div>
              <Input
                label="Email Address"
                type="email"
                placeholder="you@example.com"
                icon={<Mail className="w-5 h-5" />}
                value={formData.email}
                onChange={(e) => { setFormData({ ...formData, email: e.target.value }); checkEmail(e.target.value); }}
                required
                className="h-14"
              />
              <div className="flex items-center gap-1.5 mt-1.5 min-h-[20px] px-1">
                <StatusIndicator status={emailStatus} />
                {emailStatus === 'available' && <span className="text-xs text-green-500 font-medium">Available!</span>}
                {emailStatus === 'taken' && <span className="text-xs text-red-400 font-medium">Email already taken</span>}
              </div>
            </div>

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

            <Input
              label="Confirm Password"
              type="password"
              placeholder="••••••••"
              icon={<Lock className="w-5 h-5" />}
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              required
              className="h-14"
            />
          </div>

          <Button
            type="submit" variant="primary" size="lg"
            className="w-full mt-6 h-14 text-lg"
            isLoading={isLoading}
            disabled={usernameStatus === 'taken' || emailStatus === 'taken'}
          >
            Create Account
          </Button>
        </form>

        <p className="text-center text-text-secondary mt-10 text-lg">
          Already have an account?{' '}
          <span onClick={() => navigate('/login')} className="text-accent-purple hover:text-accent-hover font-bold cursor-pointer transition-colors">
            Sign in
          </span>
        </p>
      </div>
    </div>
  );
};
