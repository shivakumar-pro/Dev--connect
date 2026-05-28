import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';

const isAuthenticated = () => {
  return localStorage.getItem('token') !== null;
};

// Requires a logged-in user; otherwise sends to login.
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// For login/register/landing: if already logged in, go straight to the app.
// `replace` keeps these pages out of history so Back never strands on login.
const PublicOnly = ({ children }: { children: React.ReactNode }) => {
  if (isAuthenticated()) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen w-full bg-bg-primary text-text-primary font-sans">
        {/* DevConnect-theme floating colorful orbs (CSS shows only for that theme) */}
        <div className="dc-orbs" aria-hidden="true" />
        <Routes>
          {/* Public routes — redirect to the app when already signed in */}
          <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />

          {/* Protected route */}
          <Route
            path="/dashboard/*"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          {/* Unknown paths → app if logged in, else landing */}
          <Route path="*" element={<Navigate to={isAuthenticated() ? '/dashboard' : '/'} replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
