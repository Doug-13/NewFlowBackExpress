import express from 'express';

import authRouter from './routes/authRouter';
import usersRouter from './routes/usersRouter';
import organizationsRouter from './routes/organizationsRouter';
import processesRouter from './routes/processesRouter';
import metadataRouter from './routes/metadataRouter';
import workflowRouter from './routes/workflowRouter';
import workflowsRouter from './routes/workflowsRouter';
import documentsRouter from './routes/documentsRouter';
import tasksRouter from './routes/tasksRouter';
import environmentRouter from './routes/environmentRouter';
import notificationsRouter from './routes/notificationsRouter';

const app = express();

app.use(express.json());

app.use('/api/', authRouter);
app.use('/api/', usersRouter);
app.use('/api/', organizationsRouter);
app.use('/api/', processesRouter);
app.use('/api/', metadataRouter);
app.use('/api/', workflowRouter);
app.use('/api/', workflowsRouter);
app.use('/api/', documentsRouter);
app.use('/api/', tasksRouter);
app.use('/api/', environmentRouter);
app.use('/api/', notificationsRouter);

export default app;
