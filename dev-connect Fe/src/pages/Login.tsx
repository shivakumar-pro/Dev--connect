import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import {
  Mail,
  Lock,
  ArrowRight,
  MessageSquare,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Globe,
  Zap,
  Shield,
} from 'lucide-react';
import { AuthAPI } from '../services/api';
import { setCredentials } from '../store/authSlice';
import { ThemeToggleButton } from '../components/common/ThemeSwitcher';

export const Login = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await AuthAPI.login(formData);
      const loginData = res?.data || res;
      const accessToken = loginData.accessToken;

      localStorage.setItem('token', accessToken);
      dispatch(
        setCredentials({
          user: {
            id: String(loginData.userId),
            username: loginData.username,
            role: 'USER',
          },
          token: accessToken,
        })
      );
      navigate('/dashboard');
    } catch (error: any) {
      setErrorMsg(error?.response?.data?.message || 'Login failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary grid lg:grid-cols-2">
      {/* Left — form */}
      <div className="relative flex flex-col px-6 sm:px-10 lg:px-16 py-8">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-purple to-accent-orange flex items-center justify-center shadow-glow">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight">DevConnect</span>
          </button>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-text-secondary">
              New here?{' '}
              <button
                onClick={() => navigate('/register')}
                className="text-accent-purple hover:text-accent-hover font-medium transition-colors"
              >
                Create account
              </button>
            </span>
            <ThemeToggleButton />
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 flex items-center">
          <div className="w-full max-w-md mx-auto py-10">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">Welcome back</h1>
            <p className="text-text-secondary mb-8">Sign in to continue to your workspace.</p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {errorMsg && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2.5 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                icon={<Mail className="w-4 h-4" />}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                autoComplete="email"
              />

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-text-secondary">Password</label>
                  <button
                    type="button"
                    className="text-xs font-medium text-accent-purple hover:text-accent-hover transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    autoComplete="current-password"
                    className="flex h-12 w-full rounded-lg border bg-bg-secondary border-border-color text-text-primary placeholder:text-text-muted text-base pl-11 pr-11 py-3 shadow-sm transition-colors focus-visible:outline-none focus:border-accent-purple focus:ring-1 focus:ring-accent-purple/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 select-none cursor-pointer text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-border-color bg-bg-secondary accent-accent-purple"
                />
                Keep me signed in
              </label>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full gap-2"
                isLoading={isLoading}
              >
                Sign in <ArrowRight className="w-4 h-4" />
              </Button>
            </form>

            <p className="text-xs text-text-muted text-center mt-8">
              By signing in you agree to our{' '}
              <a href="#" className="underline hover:text-text-secondary">Terms</a> &amp;{' '}
              <a href="#" className="underline hover:text-text-secondary">Privacy Policy</a>.
            </p>
          </div>
        </div>

        <div className="text-xs text-text-muted text-center lg:text-left">
          © {new Date().getFullYear()} DevConnect
        </div>
      </div>

      {/* Right — brand panel */}
      <aside className="relative hidden lg:flex overflow-hidden border-l border-border-color bg-bg-secondary/40">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-accent-purple/20 blur-[140px]" />
          <div className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-accent-orange/20 blur-[140px]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-bg-secondary border border-border-color text-xs font-medium text-text-secondary mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Real-time. Always on.
            </div>
            <h2 className="text-4xl xl:text-5xl font-bold tracking-tight leading-tight mb-4">
              The home for <span className="text-gradient">developer conversations.</span>
            </h2>
            <p className="text-text-secondary text-lg leading-relaxed max-w-md">
              Join thousands of engineers chatting, collaborating, and shipping together in real time.
            </p>
          </div>

          {/* Highlights */}
          <ul className="flex flex-col gap-4 my-12 max-w-md">
            {[
              { icon: Globe, color: 'text-accent-purple', bg: 'bg-accent-purple/10', text: 'Global rooms and private groups' },
              { icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-400/10', text: 'Sub-second message delivery' },
              { icon: Shield, color: 'text-emerald-500', bg: 'bg-emerald-500/10', text: 'JWT-secured, end-to-end auth' },
            ].map((item) => (
              <li key={item.text} className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${item.bg} flex items-center justify-center`}>
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                </div>
                <span className="text-text-primary">{item.text}</span>
              </li>
            ))}
          </ul>

          {/* Testimonial */}
          <figure className="relative p-6 rounded-2xl border border-border-color bg-bg-secondary/60 backdrop-blur-md max-w-md">
            <blockquote className="text-text-primary leading-relaxed">
              “DevConnect replaced three tools for our team. It's the first chat app that actually feels
              like it was built for engineers.”
            </blockquote>
            <figcaption className="mt-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-purple to-accent-orange flex items-center justify-center text-sm font-semibold">
                A
              </div>
              <div>
                <div className="text-sm font-medium">Ada R.</div>
                <div className="text-xs text-text-muted flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Verified user
                </div>
              </div>
            </figcaption>
          </figure>
        </div>
      </aside>
    </div>
  );
};
