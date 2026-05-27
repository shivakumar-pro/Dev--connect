import { useNavigate } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { MessageSquare, Globe, Users, Shield } from 'lucide-react';

export const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col relative overflow-x-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-accent-purple/10 blur-[120px]" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-accent-orange/10 blur-[100px]" />
      </div>

      {/* Navbar */}
      <nav className="w-full z-10 p-6 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-purple to-accent-orange flex justify-center items-center">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-accent-purple to-accent-orange">
            DevConnect
          </span>
        </div>
        <div className="flex gap-4">
          <Button variant="ghost" onClick={() => navigate('/login')}>Login</Button>
          <Button variant="primary" onClick={() => navigate('/register')}>Get Started</Button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 z-10 max-w-4xl mx-auto w-full pt-12 pb-24">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-purple/10 border border-accent-purple/20 text-accent-purple text-sm font-medium mb-8">
          <span className="w-2 h-2 rounded-full bg-accent-purple animate-pulse" />
          V1.0 is now live
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
          Connect with Developers <br />
          <span className="text-gradient">Around the Globe</span>
        </h1>
        
        <p className="text-lg md:text-xl text-text-secondary mb-10 max-w-2xl leading-relaxed">
          The ultimate platform for developers to collaborate, share ideas, and build the future together. Join global rooms or create private groups.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Button size="lg" variant="primary" onClick={() => navigate('/register')} className="gap-2 text-lg px-8">
            Start Chatting <MessageSquare className="w-5 h-5" />
          </Button>
          <Button size="lg" variant="secondary" onClick={() => navigate('/login')} className="text-lg px-8">
            Login
          </Button>
        </div>

        {/* Features Preview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24 w-full text-left">
          <div className="glass p-6 rounded-2xl">
            <div className="w-12 h-12 rounded-lg bg-accent-purple/20 flex items-center justify-center mb-4">
              <Globe className="w-6 h-6 text-accent-purple" />
            </div>
            <h3 className="text-xl font-bold mb-2">Global Chat</h3>
            <p className="text-text-secondary text-sm">Join the worldwide developer community. Ask questions, share your code, and learn together.</p>
          </div>
          
          <div className="glass p-6 rounded-2xl">
            <div className="w-12 h-12 rounded-lg bg-accent-orange/20 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-accent-orange" />
            </div>
            <h3 className="text-xl font-bold mb-2">Private Groups</h3>
            <p className="text-text-secondary text-sm">Create specific rooms for your team or niche topics. Keep conversations focused.</p>
          </div>
          
          <div className="glass p-6 rounded-2xl">
            <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-emerald-500" />
            </div>
            <h3 className="text-xl font-bold mb-2">Secure & Real-time</h3>
            <p className="text-text-secondary text-sm">Powered by WebSockets for instant message delivery and JWT for robust security.</p>
          </div>
        </div>
      </main>
    </div>
  );
};
