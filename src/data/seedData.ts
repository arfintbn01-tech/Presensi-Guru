/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttendanceRecord, Teacher } from '../types';

export function getSeedRecords(teachers: Teacher[]): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  const today = new Date().toISOString().slice(0, 10);
  
  // Calculate yesterday's date
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);

  // Seed for yesterday
  teachers.forEach((t, i) => {
    // Let's make some present, some late
    let clockInTime = "07:12:15";
    let clockOutTime = "14:15:30";
    let statusIn: 'Hadir' | 'Terlambat' = 'Hadir';
    let statusOut: 'Pulang' = 'Pulang';

    if (i === 1) {
      clockInTime = "07:38:12";
      statusIn = "Terlambat";
    }

    records.push({
      id: `seed-yes-${t.id}`,
      teacherId: t.id,
      teacherName: t.name,
      nip: t.nip,
      subject: t.subject,
      date: yesterday,
      clockIn: clockInTime,
      clockOut: clockOutTime,
      statusIn,
      statusOut,
      notes: i === 1 ? "Macet di area pelabuhan" : "Presensi biometrik sukses"
    });
  });

  // Seed for today (only some checked in so user can check in the rest!)
  // Drs. Muhammad Risal, M.Pd (Kepala Sekolah) checked in
  if (teachers[0]) {
    records.push({
      id: `seed-tod-${teachers[0].id}`,
      teacherId: teachers[0].id,
      teacherName: teachers[0].name,
      nip: teachers[0].nip,
      subject: teachers[0].subject,
      date: today,
      clockIn: "06:55:18",
      clockOut: null,
      statusIn: "Hadir",
      statusOut: null,
      notes: "Hadir membuka gerbang sekolah"
    });
  }

  // Marlina Tomia S.Pd checked in late
  if (teachers[1]) {
    records.push({
      id: `seed-tod-${teachers[1].id}`,
      teacherId: teachers[1].id,
      teacherName: teachers[1].name,
      nip: teachers[1].nip,
      subject: teachers[1].subject,
      date: today,
      clockIn: "07:42:04",
      clockOut: null,
      statusIn: "Terlambat",
      statusOut: null,
      notes: "Sinyal GPS terganggu"
    });
  }

  // Ridwan Sangaji, S.T has a medical excuse (Sakit)
  if (teachers[4]) {
    records.push({
      id: `seed-tod-${teachers[4].id}`,
      teacherId: teachers[4].id,
      teacherName: teachers[4].name,
      nip: teachers[4].nip,
      subject: teachers[4].subject,
      date: today,
      clockIn: null,
      clockOut: null,
      statusIn: "Sakit",
      statusOut: null,
      notes: "Surat sakit flu berat dilampirkan via WA"
    });
  }

  return records;
}
