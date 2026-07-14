import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { ConfirmHost } from './components/confirm';
import { Layout } from './components/Layout';
import { AgencyPortal } from './pages/AgencyPortal';

// The back office is admin-only — keep its weight out of everyone else's load.
const BackOffice = lazy(() =>
  import('./backoffice/BackOffice').then((m) => ({ default: m.BackOffice })),
);
import { SupportForm } from './components/SupportForm';
import { CompanyAgents } from './pages/CompanyAgents';
import { CompanyBilling } from './pages/CompanyBilling';
import { CompanyJobs } from './pages/CompanyJobs';
import { CompanyReputation } from './pages/CompanyReputation';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Settings } from './pages/Settings';
import { Team } from './pages/Team';
import { Timesheets } from './pages/Timesheets';
import { TradieDetail } from './pages/TradieDetail';

function CompanySupport() {
  const { company } = useAuth();
  if (!company) return null;
  return (
    <SupportForm
      from={{ id: company.id, name: company.name, email: company.adminEmail, role: 'company' }}
    />
  );
}

export default function App() {
  const { company, agency, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }

  const spinner = (
    <div className="center-screen">
      <div className="spinner" />
    </div>
  );

  if (isAdmin)
    return (
      <>
        <Suspense fallback={spinner}>
          <BackOffice />
        </Suspense>
        <ConfirmHost />
      </>
    );
  if (agency)
    return (
      <>
        <AgencyPortal agency={agency} />
        <ConfirmHost />
      </>
    );
  if (!company) return <Login />;

  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs" element={<CompanyJobs />} />
          <Route path="/team" element={<Team />} />
          <Route path="/timesheets" element={<Timesheets />} />
          <Route path="/reputation" element={<CompanyReputation />} />
          <Route path="/billing" element={<CompanyBilling />} />
          <Route path="/agents" element={<CompanyAgents />} />
          <Route path="/support" element={<CompanySupport />} />
          <Route path="/tradie/:id" element={<TradieDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <ConfirmHost />
    </>
  );
}
