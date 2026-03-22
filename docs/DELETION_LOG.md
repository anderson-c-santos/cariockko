# Code Deletion Log

## [2026-03-21] Refactor Session - Simplify Supabase Setup

### Context
User reported issues with Supabase initialization and Docker services restarting. Goal is to simplify the setup for local development without complex authentication/key management.

### Unused Dependencies Removed
- `uuid` (v11.0.0) - Never imported or used anywhere in the codebase
- `@types/uuid` - Type definitions for unused uuid package

### Unused Files Deleted
- `web/src/components/SessionInit.tsx` - Exported component but never imported in any page/layout

### Code Simplified
- `api/src/lib/supabase.ts` - Removed complex JWT signing/validation logic
  - Removed `base64UrlEncode()` function
  - Removed `signJwt()` function
  - Removed `isValidJwtSignature()` function
  - Removed `buildSupabaseServiceKey()` function
  - Simplified to directly use service key or fallback to anon key for local dev

- `web/src/lib/supabase.ts` - Simplified Supabase client
  - Removed complex Proxy pattern
  - Removed error throwing for missing anon key (use empty string fallback)
  - Simplified to direct lazy initialization

- `.env` and `.env.example` - Updated with proper defaults for local development
  - Added comments explaining local dev setup
  - Set meaningful default values

### Impact
- Files deleted: 1
- Dependencies removed: 2
- Lines of code removed: ~80
- Simplified Supabase connection logic for local development

### Testing Completed
- [x] TypeScript compilation passes (api)
- [x] TypeScript compilation passes (web)
- [x] No lint errors

### Benefits
1. **Simpler setup** - No need to generate/validate JWT tokens locally
2. **Fewer dependencies** - Removed unused uuid package
3. **Cleaner code** - Removed dead code and unused components
4. **Better defaults** - .env files have meaningful defaults for local dev
