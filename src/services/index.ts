/**
 * Service selector.
 *
 * Today this points at the mock backend so the app runs with zero external
 * setup. When you're ready to go live, create a Firestore-backed class that
 * implements `Backend` (see `firebase.ts`) and switch the export below — no
 * screen or hook changes required.
 */
import { mockBackend } from './mockBackend';

export const backend = mockBackend;

// Mock-only helpers (session bootstrap + demo reset). The real Firebase
// implementation would replace these with `onAuthStateChanged`.
export const getSessionUser = () => mockBackend.getSessionUser();
export const resetDemoData = () => mockBackend.resetDemoData();

export * from './backend';
