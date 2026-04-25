"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAuthResponse = buildAuthResponse;
function buildAuthResponse(user, token) {
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
