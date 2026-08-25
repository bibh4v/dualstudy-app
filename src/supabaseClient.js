/**
 * Supabase Client Initialization
 * Dual-Track Planner — MSc & NEA Level 8
 *
 * Initialize with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from environment
 */

import { createClient } from '@supabase/supabase-js';

// Environment variables (set via .env or platform config)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
        '❌ Supabase credentials missing!\n' +
        'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env file.\n' +
        'See .env.example for template.'
    );
}

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        // Persist session in localStorage (default)
        storage: {
            getItem: (key) => {
                if (typeof window !== 'undefined') {
                    return window.localStorage.getItem(key);
                }
                return null;
            },
            setItem: (key, value) => {
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem(key, value);
                }
            },
            removeItem: (key) => {
                if (typeof window !== 'undefined') {
                    window.localStorage.removeItem(key);
                }
            },
        },
        // Auto-refresh token before expiry
        autoRefreshToken: true,
        // Detect session in URL (for OAuth redirects)
        detectSessionInUrl: true,
        // Persist session across tabs
        persistSession: true,
    },
    // Global error handling for network issues
    global: {
        fetch: (...args) => {
            return fetch(...args).catch(err => {
                console.error('Supabase fetch error:', err);
                throw err;
            });
        },
    },
});

// Helper: Get current authenticated user
export async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
        console.error('getCurrentUser error:', error);
        return null;
    }
    return user;
}

// Helper: Get current session
export async function getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error('getSession error:', error);
        return null;
    }
    return session;
}

// Helper: Sign up with email/password
export async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
    });
    return { data, error };
}

// Helper: Sign in with email/password
export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
    });
    return { data, error };
}

// Helper: Sign out
export async function signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
}

// Helper: Listen for auth state changes
export function onAuthStateChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });
    return subscription;
}

// Helper: Upload file to note-attachments bucket
// Returns { url, name, type, size } or throws error
export async function uploadAttachment(file, userId) {
    const fileExt = file.name.split('.').pop().toLowerCase();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    const { data, error } = await supabase.storage
        .from('note-attachments')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
        });

    if (error) {
        throw new Error(`Upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
        .from('note-attachments')
        .getPublicUrl(data.path);

    return {
        url: publicUrl,
        name: file.name,
        type: file.type,
        size: file.size,
        path: data.path, // Storage path for potential deletion
    };
}

// Helper: Delete attachment from storage
export async function deleteAttachment(storagePath) {
    const { error } = await supabase.storage
        .from('note-attachments')
        .remove([storagePath]);

    if (error) {
        console.warn('Delete attachment warning:', error.message);
    }
    return { error };
}

// Export auth helpers for convenience
export const auth = {
    signUp,
    signIn,
    signOut,
    getCurrentUser,
    getSession,
    onAuthStateChange,
};

export default supabase;