/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Teacher {
  id: string;
  name: string;
  nip: string;
  subject: string;
  gender: 'Laki-laki' | 'Perempuan';
  photo: string; // base64 / dataURL of registered image, or default avatar
  registeredAt: string;
}

export type AttendanceStatus = 'TEPAT_WAKTU' | 'TERLAMBAT' | 'ALFA' | 'IZIN' | 'SAKIT';

export interface AttendanceRecord {
  id: string;
  teacherId: string;
  teacherName: string;
  nip: string;
  subject: string;
  date: string; // YYYY-MM-DD
  clockIn: string | null; // HH:mm:ss
  clockOut: string | null; // HH:mm:ss
  statusIn: 'Hadir' | 'Terlambat' | 'Izin' | 'Sakit' | 'Alfa' | null;
  statusOut: 'Pulang' | 'Pulang Cepat' | null;
  notes?: string;
  verificationPhoto?: string;
  livenessVerified?: boolean;
}

export interface SchoolConfig {
  schoolName: string;
  clockInStart: string; // "07:00"
  clockInLate: string; // "07:30"
  clockOutTime: string; // "14:00"
  adminPin?: string; // PIN pengaman dashboard
  isPinEnabled?: boolean; // Status aktif PIN
}
