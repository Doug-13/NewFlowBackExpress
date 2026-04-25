"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const authRouter_1 = __importDefault(require("./routes/authRouter"));
const usersRouter_1 = __importDefault(require("./routes/usersRouter"));
const organizationsRouter_1 = __importDefault(require("./routes/organizationsRouter"));
const processesRouter_1 = __importDefault(require("./routes/processesRouter"));
const metadataRouter_1 = __importDefault(require("./routes/metadataRouter"));
const workflowRouter_1 = __importDefault(require("./routes/workflowRouter"));
const workflowsRouter_1 = __importDefault(require("./routes/workflowsRouter"));
const documentsRouter_1 = __importDefault(require("./routes/documentsRouter"));
const tasksRouter_1 = __importDefault(require("./routes/tasksRouter"));
const environmentRouter_1 = __importDefault(require("./routes/environmentRouter"));
const notificationsRouter_1 = __importDefault(require("./routes/notificationsRouter"));
const dashboardRouter_1 = __importDefault(require("./routes/dashboardRouter"));
const documentRelationsRouter_1 = __importDefault(require("./routes/documentRelationsRouter"));
const app = (0, express_1.default)();
const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
];
app.use((0, cors_1.default)({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', (0, cors_1.default)({
    origin: allowedOrigins,
    credentials: true,
}));
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((req, _res, next) => {
    console.log(`[HTTP] ${req.method} ${req.originalUrl}`);
    next();
});
app.use('/api', authRouter_1.default);
app.use('/api', usersRouter_1.default);
app.use('/api', organizationsRouter_1.default);
app.use('/api', processesRouter_1.default);
app.use('/api', metadataRouter_1.default);
app.use('/api', workflowRouter_1.default);
app.use('/api', workflowsRouter_1.default);
app.use('/api', documentsRouter_1.default);
app.use('/api', tasksRouter_1.default);
app.use('/api', environmentRouter_1.default);
app.use('/api', notificationsRouter_1.default);
app.use('/api', dashboardRouter_1.default);
app.use('/api', documentRelationsRouter_1.default);
app.use((err, req, res, _next) => {
    var _a;
    console.error('[GLOBAL ERROR]', req.method, req.originalUrl, err);
    res.status(500).json({
        message: 'Erro interno do servidor.',
        error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : 'unknown error',
    });
});
exports.default = app;
