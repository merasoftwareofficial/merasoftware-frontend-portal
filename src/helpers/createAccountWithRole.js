import SummaryApi from '../common';

// Sign-up always creates a blog-only 'member', so an admin creating a portal user
// signs the account up and then grants the role through the admin-only addRole.
const createAccountWithRole = async (account, role) => {
  const signupResponse = await fetch(SummaryApi.signUP.url, {
    method: SummaryApi.signUP.method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(account),
  });
  const created = await signupResponse.json();
  if (!created.success) return created;

  const roleResponse = await fetch(SummaryApi.addRoleToUser.url, {
    method: SummaryApi.addRoleToUser.method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: created.data._id, role }),
  });
  const assigned = await roleResponse.json();
  if (!assigned.success) {
    return {
      success: false,
      message: `Account created, but the ${role} role could not be set: ${assigned.message || 'unknown error'}`,
    };
  }
  return { success: true, data: assigned.data };
};

export default createAccountWithRole;
