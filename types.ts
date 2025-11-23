export interface StaffMember {
  id: string;
  name: string;
  joinedAt: number;
}

export interface GeoLocation {
  lat: number;
  lng: number;
  timestamp: number;
}

export interface WorkSession {
  id: string;
  staffId: string;
  staffName: string;
  startTime: number;
  endTime?: number;
  startLocation: GeoLocation;
  endLocation?: GeoLocation;
}

export enum AppView {
  LANDING = 'LANDING',
  ADMIN_LOGIN = 'ADMIN_LOGIN',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD',
  STAFF_PORTAL = 'STAFF_PORTAL',
}

export const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'VFqatar@123'
};
