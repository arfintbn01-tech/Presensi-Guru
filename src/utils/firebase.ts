import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { Teacher, AttendanceRecord } from '../types';

export interface FirebaseConfigCredentials {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

// Dynamic Firebase App Cache
let dbInstance: any = null;

export function getFirebaseDb(credentials: FirebaseConfigCredentials | null) {
  if (!credentials || !credentials.projectId) return null;
  try {
    const apps = getApps();
    let app;
    if (apps.length === 0) {
      app = initializeApp(credentials);
    } else {
      app = getApp();
    }
    if (!dbInstance) {
      dbInstance = getFirestore(app);
    }
    return dbInstance;
  } catch (err) {
    console.error("Firebase Initialization Error:", err);
    return null;
  }
}

/**
 * Sync entire local data list to cloud (migration helper)
 */
export async function migrateLocalToCloud(
  credentials: FirebaseConfigCredentials,
  teachers: Teacher[],
  records: AttendanceRecord[]
): Promise<void> {
  const db = getFirebaseDb(credentials);
  if (!db) throw new Error("Gagal menginisialisasi database Cloud Firebase.");

  try {
    // Write Teachers in batch
    const teachersBatch = writeBatch(db);
    teachers.forEach(teacher => {
      const teacherRef = doc(db, 'teachers', teacher.id);
      teachersBatch.set(teacherRef, teacher);
    });
    await teachersBatch.commit();

    // Write Records in batch
    const recordsBatch = writeBatch(db);
    records.forEach(record => {
      const recordRef = doc(db, 'attendance', record.id);
      recordsBatch.set(recordRef, record);
    });
    await recordsBatch.commit();
  } catch (error) {
    console.error("Error migrating local data to Cloud Firestore:", error);
    throw error;
  }
}

/**
 * Save single teacher to Firestore
 */
export async function saveTeacherToCloud(
  credentials: FirebaseConfigCredentials,
  teacher: Teacher
): Promise<void> {
  const db = getFirebaseDb(credentials);
  if (!db) return;
  try {
    await setDoc(doc(db, 'teachers', teacher.id), teacher);
  } catch (error) {
    console.error("Error saving teacher to Firestore:", error);
  }
}

/**
 * Delete teacher from Firestore
 */
export async function deleteTeacherFromCloud(
  credentials: FirebaseConfigCredentials,
  teacherId: string
): Promise<void> {
  const db = getFirebaseDb(credentials);
  if (!db) return;
  try {
    await deleteDoc(doc(db, 'teachers', teacherId));
  } catch (error) {
    console.error("Error deleting teacher from Firestore:", error);
  }
}

/**
 * Save single attendance log to Firestore
 */
export async function saveAttendanceToCloud(
  credentials: FirebaseConfigCredentials,
  record: AttendanceRecord
): Promise<void> {
  const db = getFirebaseDb(credentials);
  if (!db) return;
  try {
    await setDoc(doc(db, 'attendance', record.id), record);
  } catch (error) {
    console.error("Error saving attendance to Firestore:", error);
  }
}

/**
 * Delete attendance log from Firestore
 */
export async function deleteAttendanceFromCloud(
  credentials: FirebaseConfigCredentials,
  recordId: string
): Promise<void> {
  const db = getFirebaseDb(credentials);
  if (!db) return;
  try {
    await deleteDoc(doc(db, 'attendance', recordId));
  } catch (error) {
    console.error("Error deleting attendance from Firestore:", error);
  }
}

/**
 * Dynamic Subscribe to Teachers Collection
 */
export function subscribeTeachers(
  credentials: FirebaseConfigCredentials,
  onUpdate: (teachers: Teacher[]) => void
) {
  const db = getFirebaseDb(credentials);
  if (!db) return () => {};

  return onSnapshot(collection(db, 'teachers'), (snapshot) => {
    const list: Teacher[] = [];
    snapshot.forEach((docSnap) => {
      list.push(docSnap.data() as Teacher);
    });
    // Sort by registration date descending
    list.sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime());
    onUpdate(list);
  }, (error) => {
    console.error("Error subscribing to teachers collection:", error);
  });
}

/**
 * Dynamic Subscribe to Attendance Collection
 */
export function subscribeAttendance(
  credentials: FirebaseConfigCredentials,
  onUpdate: (records: AttendanceRecord[]) => void
) {
  const db = getFirebaseDb(credentials);
  if (!db) return () => {};

  return onSnapshot(collection(db, 'attendance'), (snapshot) => {
    const list: AttendanceRecord[] = [];
    snapshot.forEach((docSnap) => {
      list.push(docSnap.data() as AttendanceRecord);
    });
    // Sort by date/time descending
    list.sort((a, b) => {
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      const timeA = a.clockIn || a.clockOut || '';
      const timeB = b.clockIn || b.clockOut || '';
      return timeB.localeCompare(timeA);
    });
    onUpdate(list);
  }, (error) => {
    console.error("Error subscribing to attendance collection:", error);
  });
}
