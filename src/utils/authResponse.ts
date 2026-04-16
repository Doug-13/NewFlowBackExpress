export function buildAuthResponse(
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    account_id: string;
  },
  token: string,
) {
  return {
    accessToken: token,
    tokenType: 'Bearer',
    enabledModules: [
      'documents',
      'workflow',
      'metadata',
      'users',
      'organization',
      'notification_templates',
    ],
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accountId: user.account_id,
    },
  };
}
