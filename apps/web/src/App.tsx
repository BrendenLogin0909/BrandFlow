import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ClientSwitcher } from './components/ClientSwitcher';
import { DashboardPage } from './pages/DashboardPage';
import { BrandProfilesPage } from './pages/BrandProfilesPage';
import { CalendarPage } from './pages/CalendarPage';
import { PostPackagesPage } from './pages/PostPackagesPage';
import { EditorPage } from './pages/EditorPage';
import { AssetLibraryPage } from './pages/AssetLibraryPage';
import { ReviewQueuePage } from './pages/ReviewQueuePage';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/brand', label: 'Brand profiles' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/packages', label: 'Post packages' },
  { to: '/assets', label: 'Asset library' },
  { to: '/review', label: 'Review queue' },
];

export default function App() {
  return (
    <div className="flex h-screen bg-slate-50 text-slate-900">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-4 text-lg font-bold tracking-tight">
          Brand<span className="text-indigo-600">Flow</span>
        </div>
        <ClientSwitcher />
        <nav className="mt-2 flex-1 space-y-0.5 px-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/brand" element={<BrandProfilesPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/packages" element={<PostPackagesPage />} />
          <Route path="/packages/:packageId/editor/:designDocumentId" element={<EditorPage />} />
          <Route path="/assets" element={<AssetLibraryPage />} />
          <Route path="/review" element={<ReviewQueuePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
