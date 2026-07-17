// src/hooks/useAdminScope.js
//
// What institution is this admin looking at?
//
// READ THIS BEFORE USING IT: this hook is no longer a security boundary, and
// must not be treated as one. Scoping is enforced by the SERVER — every endpoint
// re-derives the caller's institution from their profile and ignores whatever
// the client asks for. An institution admin who calls
//     GET /api/students?institutionId=<some-other-college>
// gets their OWN students back. That's tested, not assumed.
//
// So this hook exists for two smaller reasons now:
//   1. telling the UI what it's showing ("viewing: St. Joseph's")
//   2. giving a super-admin an institution filter
// Passing institutionId to a query is a HINT. It is honoured only for
// super-admins, and it cannot widen anyone's access.
//
// `scopeStudents` was REMOVED. It filtered an already-fetched list in the
// browser, which was never real protection — the out-of-scope data had already
// been sent — and is now redundant, because the server doesn't send it at all.
import { useAuth } from '../contexts/AuthContext';

export const useAdminScope = () => {
  const { userData, loading, isSuperAdmin, institutionId } = useAuth();

  return {
    loading,
    isSuperAdmin,
    // null => "no filter". For a super-admin that means every institution.
    // For anyone else the server pins it to their own regardless.
    institutionId: isSuperAdmin ? null : institutionId,
    institutionName: userData?.institutionName || null,
  };
};

export default useAdminScope;
