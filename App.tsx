import React, { useState, useEffect, useCallback } from 'react';
import { AppView, ADMIN_CREDENTIALS, StaffMember, WorkSession } from './types';
import * as storage from './services/storageService';
import * as gemini from './services/geminiService';
import { Button } from './components/Button';
import { Card } from './components/Card';

const Icons = {
  MapPin: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-9 13-9 13s-9-7-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>,
  Clock: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Users: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  LogOut: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>,
  Activity: () => <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  Brain: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>,
  Trash: () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
};

const Header = ({ title, onLogout }: { title: string, onLogout: () => void }) => (
  <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
    <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
      <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
        <Icons.MapPin />
        {title}
      </h1>
      <Button variant="outline" onClick={onLogout} className="text-sm py-1.5 px-3">
        <span className="flex items-center gap-2">
          <Icons.LogOut /> Logout
        </span>
      </Button>
    </div>
  </header>
);

export default function App() {
  const [view, setView] = useState<AppView>(AppView.LANDING);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  
  // Admin State
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Staff State
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [activeSession, setActiveSession] = useState<WorkSession | undefined>(undefined);
  const [locationError, setLocationError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialization & Data Refresh
  const refreshData = useCallback(() => {
    setStaffList(storage.getStaff());
    setSessions(storage.getSessions());
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData, view]); // Refresh whenever view changes to ensure data is up to date

  // Handlers
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminUser === ADMIN_CREDENTIALS.username && adminPass === ADMIN_CREDENTIALS.password) {
      setView(AppView.ADMIN_DASHBOARD);
      setLoginError('');
      setAdminUser('');
      setAdminPass('');
      refreshData();
    } else {
      setLoginError('Invalid credentials');
    }
  };

  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim()) return;
    storage.addStaff(newStaffName);
    refreshData();
    setNewStaffName('');
  };

  const handleRemoveStaff = (id: string) => {
    if (window.confirm("Are you sure? This will remove the staff member from the list.")) {
      storage.removeStaff(id);
      refreshData();
    }
  };

  const handleStaffLogin = () => {
    if (!selectedStaffId) return;
    const session = storage.getActiveSession(selectedStaffId);
    setActiveSession(session);
    setView(AppView.STAFF_PORTAL);
  };

  const getCurrentLocation = (): Promise<{lat: number, lng: number}> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser"));
      } else {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude
            });
          },
          (error) => {
            reject(error);
          }
        );
      }
    });
  };

  const handleStartWork = async () => {
    setLocationError('');
    setIsProcessing(true);
    try {
      const loc = await getCurrentLocation();
      const staffMember = staffList.find(s => s.id === selectedStaffId);
      if (staffMember) {
        const session = storage.startSession(staffMember.id, staffMember.name, loc);
        setActiveSession(session);
        refreshData();
      }
    } catch (err) {
      setLocationError("Could not access location. Please allow location permissions to start work.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEndWork = async () => {
    if (!activeSession) return;
    setLocationError('');
    setIsProcessing(true);
    try {
      const loc = await getCurrentLocation();
      storage.endSession(activeSession.id, loc);
      setActiveSession(undefined);
      refreshData();
      alert("Work session finished successfully!");
      setView(AppView.LANDING);
    } catch (err) {
      setLocationError("Could not access location. Location is required to finish work.");
    } finally {
      setIsProcessing(false);
    }
  };

  const generateReport = async () => {
    setIsGeneratingReport(true);
    // Ensure we send sessions with names even if older logs are missing them
    const hydratedSessions = sessions.map(s => ({
      ...s,
      staffName: s.staffName || staffList.find(m => m.id === s.staffId)?.name || 'Unknown Staff'
    }));
    const report = await gemini.generateWorkReport(hydratedSessions);
    setAiReport(report);
    setIsGeneratingReport(false);
  };

  const calculateTotalHours = (staffId: string) => {
    const staffSessions = sessions.filter(s => s.staffId === staffId && s.endTime);
    const totalMs = staffSessions.reduce((acc, curr) => acc + ((curr.endTime || 0) - curr.startTime), 0);
    return (totalMs / (1000 * 60 * 60)).toFixed(2);
  };

  // --- Views ---

  const renderLanding = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-slate-900 mb-2 tracking-tight">Fouad Hammam</h1>
          <p className="text-slate-500 font-medium">Workforce Management System</p>
        </div>
        
        <div className="space-y-4">
          <Card className="hover:shadow-md transition-shadow" title="Staff Access">
            <div className="space-y-4">
              <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 text-sm text-blue-800">
                Select your name below to start or end your shift.
              </div>
              <select 
                className="w-full p-3 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 font-medium"
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
              >
                <option value="">-- Select Your Name --</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <Button 
                className="w-full py-3" 
                disabled={!selectedStaffId}
                onClick={handleStaffLogin}
              >
                Enter Portal
              </Button>
            </div>
          </Card>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-gradient-to-br from-blue-50 to-slate-100 text-slate-500">Administrator</span>
            </div>
          </div>

          <Button 
            variant="secondary" 
            className="w-full"
            onClick={() => setView(AppView.ADMIN_LOGIN)}
          >
            Admin Login
          </Button>
        </div>
      </div>
    </div>
  );

  const renderAdminLogin = () => (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <Card title="Admin Login" className="w-full max-w-md">
        <form onSubmit={handleAdminLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Username</label>
            <input 
              type="text" 
              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={adminUser}
              onChange={e => setAdminUser(e.target.value)}
              placeholder="Enter username"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
            <input 
              type="password" 
              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={adminPass}
              onChange={e => setAdminPass(e.target.value)}
              placeholder="Enter password"
            />
          </div>
          {loginError && <p className="text-red-500 text-sm font-medium">{loginError}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setView(AppView.LANDING)}>Cancel</Button>
            <Button type="submit" className="flex-1">Login</Button>
          </div>
        </form>
      </Card>
    </div>
  );

  const renderAdminDashboard = () => (
    <div className="min-h-screen bg-slate-50 pb-10">
      <Header title="Admin Dashboard" onLogout={() => setView(AppView.LANDING)} />
      
      <main className="max-w-6xl mx-auto p-4 space-y-8">
        {/* Top Section: Staff Management */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <Card title="Add New Staff" className="md:col-span-1 h-fit shadow-md">
            <form onSubmit={handleAddStaff} className="space-y-4">
              <div>
                 <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Full Name</label>
                 <input 
                  type="text" 
                  placeholder="e.g., John Doe"
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newStaffName}
                  onChange={e => setNewStaffName(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={!newStaffName}>
                <span className="flex items-center gap-2">
                   <Icons.Users /> Add Staff Member
                </span>
              </Button>
            </form>
          </Card>

          <Card title="Staff Overview" className="md:col-span-2 shadow-md">
            <div className="max-h-64 overflow-y-auto pr-2">
              {staffList.length === 0 ? (
                <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  No staff members added yet.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {staffList.map(s => (
                    <li key={s.id} className="py-3 flex justify-between items-center hover:bg-slate-50 rounded-lg px-2 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg shadow-sm">
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{s.name}</p>
                          <p className="text-xs text-slate-500 font-medium">
                            Total Hours: <span className="text-blue-600">{calculateTotalHours(s.id)} hrs</span>
                          </p>
                        </div>
                      </div>
                      <Button 
                        variant="danger" 
                        className="p-2 text-red-600 bg-red-50 hover:bg-red-100 border-red-100" 
                        onClick={() => handleRemoveStaff(s.id)}
                        title="Remove Staff"
                      >
                        <Icons.Trash />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {/* Bottom Section: Work Logs */}
        <Card className="shadow-md overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-slate-100 pb-4">
               <div>
                  <h3 className="font-bold text-lg text-slate-800">Work Logs</h3>
                  <p className="text-sm text-slate-500">Real-time tracking of staff location and duration.</p>
               </div>
               <Button variant="secondary" onClick={generateReport} isLoading={isGeneratingReport} className="text-sm shrink-0 bg-indigo-600 hover:bg-indigo-700 border-transparent text-white">
                 <span className="flex items-center gap-2">
                   <Icons.Brain /> Generate AI Report
                 </span>
               </Button>
            </div>

            {aiReport && (
              <div className="mb-6 bg-indigo-50 border border-indigo-100 rounded-xl p-6 relative">
                <h4 className="text-indigo-900 font-bold mb-3 flex items-center gap-2 text-lg">
                  <Icons.Brain /> Assistant Insight
                </h4>
                <div className="prose prose-sm prose-indigo max-w-none whitespace-pre-line text-slate-700 leading-relaxed">
                  {aiReport}
                </div>
                <button 
                  onClick={() => setAiReport(null)} 
                  className="absolute top-4 right-4 text-indigo-400 hover:text-indigo-600"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm text-left bg-white">
                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-xs border-b border-slate-200">
                  <tr>
                    <th className="py-4 px-6">Staff Name</th>
                    <th className="py-4 px-6">Start Time</th>
                    <th className="py-4 px-6">Start Location</th>
                    <th className="py-4 px-6">End Time</th>
                    <th className="py-4 px-6">End Location</th>
                    <th className="py-4 px-6 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessions.slice().reverse().map(session => {
                    const duration = session.endTime 
                      ? ((session.endTime - session.startTime) / (1000 * 60 * 60)).toFixed(2) + ' hrs' 
                      : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 animate-pulse">Active</span>;
                    
                    // Robust name retrieval
                    const staffName = session.staffName || staffList.find(s => s.id === session.staffId)?.name || 'Unknown Staff';
                    
                    return (
                      <tr key={session.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="py-4 px-6 font-semibold text-slate-900">{staffName}</td>
                        <td className="py-4 px-6 text-slate-600">
                          {new Date(session.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-4 px-6">
                           <a 
                            href={`https://maps.google.com/?q=${session.startLocation.lat},${session.startLocation.lng}`} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-medium"
                           >
                             <Icons.MapPin /> View
                           </a>
                        </td>
                        <td className="py-4 px-6 text-slate-600">
                          {session.endTime ? new Date(session.endTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                         <td className="py-4 px-6">
                           {session.endLocation ? (
                              <a 
                                href={`https://maps.google.com/?q=${session.endLocation.lat},${session.endLocation.lng}`} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-medium"
                              >
                                <Icons.MapPin /> View
                              </a>
                           ) : <span className="text-slate-400">-</span>}
                        </td>
                        <td className="py-4 px-6 text-right font-medium text-slate-700">{duration}</td>
                      </tr>
                    );
                  })}
                  {sessions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 italic bg-slate-50/30">
                        No work sessions recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
        </Card>
      </main>
    </div>
  );

  const renderStaffPortal = () => {
    const staffName = staffList.find(s => s.id === selectedStaffId)?.name || 'Staff';

    return (
      <div className="min-h-screen bg-slate-50">
         <Header title={`Portal: ${staffName}`} onLogout={() => { setSelectedStaffId(''); setView(AppView.LANDING); }} />
         
         <main className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 4rem)' }}>
            <div className="w-full max-w-md space-y-6">
              
              {locationError && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm border border-red-200 shadow-sm flex items-start gap-2">
                   <div className="shrink-0 mt-0.5">⚠️</div>
                   {locationError}
                </div>
              )}

              {!activeSession ? (
                <Card className="text-center py-10 px-6 shadow-lg border-t-4 border-t-blue-500">
                  <div className="w-24 h-24 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <Icons.Clock />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">Ready to Start?</h2>
                  <p className="text-slate-500 mb-8 max-w-xs mx-auto">Your GPS location will be recorded securely when you clock in.</p>
                  <Button 
                    className="w-full text-lg py-4 font-bold shadow-blue-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5" 
                    onClick={handleStartWork}
                    isLoading={isProcessing}
                  >
                    Start Work Shift
                  </Button>
                </Card>
              ) : (
                <Card className="text-center py-10 px-6 shadow-lg border-t-4 border-t-green-500 bg-gradient-to-b from-white to-green-50/30">
                  <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse shadow-inner">
                     <Icons.Activity />
                  </div>
                  <h2 className="text-2xl font-bold text-green-800 mb-2">Shift In Progress</h2>
                  <div className="inline-block px-4 py-1 bg-green-100 rounded-full text-green-700 font-medium text-sm mb-2">
                    Started at {new Date(activeSession.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </div>
                  <p className="text-slate-500 text-sm mb-8">Have a productive day, {staffName}!</p>
                  
                  <Button 
                    variant="danger"
                    className="w-full text-lg py-4 font-bold shadow-red-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5" 
                    onClick={handleEndWork}
                    isLoading={isProcessing}
                  >
                    Finish Work & Clock Out
                  </Button>
                </Card>
              )}
            </div>
         </main>
      </div>
    );
  };

  return (
    <>
      {view === AppView.LANDING && renderLanding()}
      {view === AppView.ADMIN_LOGIN && renderAdminLogin()}
      {view === AppView.ADMIN_DASHBOARD && renderAdminDashboard()}
      {view === AppView.STAFF_PORTAL && renderStaffPortal()}
    </>
  );
}