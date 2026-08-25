// ============================================================================
// Dual-Track Planner — Supabase Configuration
// ============================================================================
// Copy this file content into a new file named `config.js` in the same folder,
// or replace these values with your Supabase project credentials.
//
// Get credentials from: Supabase Dashboard → Settings → API
// https://supabase.com/dashboard/project/_/settings/api
// ============================================================================

window.SUPABASE_CONFIG = {
    // Your Supabase project URL (e.g., https://abcdefghijklmno.supabase.co)
    url: 'https://your-project-ref.supabase.co',

    // Your Supabase anon/public key (safe to expose in frontend)
    anonKey: 'your-anon-public-key-here'
};

// ============================================================================
// IMPORTANT: This file should be gitignored or kept private per-deployment.
// The anon key is safe for frontend use (RLS protects your data).
// ============================================================================
