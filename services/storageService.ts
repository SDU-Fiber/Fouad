import { StaffMember, WorkSession } from '../types';

const STAFF_KEY = 'fh_staff';
const SESSIONS_KEY = 'fh_sessions';

export const getStaff = (): StaffMember[] => {
  const data = localStorage.getItem(STAFF_KEY);
  return data ? JSON.parse(data) : [];
};

export const addStaff = (name: string): StaffMember => {
  const staff = getStaff();
  const newMember: StaffMember = {
    id: crypto.randomUUID(),
    name,
    joinedAt: Date.now(),
  };
  localStorage.setItem(STAFF_KEY, JSON.stringify([...staff, newMember]));
  return newMember;
};

export const removeStaff = (id: string): void => {
  const staff = getStaff().filter(s => s.id !== id);
  localStorage.setItem(STAFF_KEY, JSON.stringify(staff));
};

export const getSessions = (): WorkSession[] => {
  const data = localStorage.getItem(SESSIONS_KEY);
  return data ? JSON.parse(data) : [];
};

export const startSession = (staffId: string, staffName: string, location: {lat: number, lng: number}): WorkSession => {
  const sessions = getSessions();
  const newSession: WorkSession = {
    id: crypto.randomUUID(),
    staffId,
    staffName,
    startTime: Date.now(),
    startLocation: { ...location, timestamp: Date.now() },
  };
  localStorage.setItem(SESSIONS_KEY, JSON.stringify([...sessions, newSession]));
  return newSession;
};

export const endSession = (sessionId: string, location: {lat: number, lng: number}): void => {
  const sessions = getSessions();
  const updated = sessions.map(s => {
    if (s.id === sessionId) {
      return {
        ...s,
        endTime: Date.now(),
        endLocation: { ...location, timestamp: Date.now() },
      };
    }
    return s;
  });
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
};

export const getActiveSession = (staffId: string): WorkSession | undefined => {
  const sessions = getSessions();
  // Find a session for this user that has no end time
  return sessions.find(s => s.staffId === staffId && !s.endTime);
};
