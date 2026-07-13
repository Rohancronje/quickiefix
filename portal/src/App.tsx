import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { BackOffice } from './backoffice/BackOffice';
import { Layout } from './components/Layout';
import { AgencyPortal } from './pages/AgencyPortal';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Settings } from './pages/Settings';
import { Team } from './pages/Team';
import { Timesheets } from './pages/Timesheets';
import { TradieDetail } from './pages/TradieDetail';

export default function App() {
  const { company, agency, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (isAdmin) return <BackOffice />;
  if (agency) return <AgencyPortal agency={agency} />;
  if (!company) return <Login />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/team" element={<Team />} />
        <Route path="/timesheets" element={<Timesheets />} />
        <Route path="/tradie/:id" element={<TradieDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
