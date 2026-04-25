import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'

import authRouter from './routes/authRouter'
import usersRouter from './routes/usersRouter'
import organizationsRouter from './routes/organizationsRouter'
import processesRouter from './routes/processesRouter'
import metadataRouter from './routes/metadataRouter'
import workflowRouter from './routes/workflowRouter'
import workflowsRouter from './routes/workflowsRouter'
import documentsRouter from './routes/documentsRouter'
import tasksRouter from './routes/tasksRouter'
import environmentRouter from './routes/environmentRouter'
import notificationsRouter from './routes/notificationsRouter'
import dashboardRouter from './routes/dashboardRouter'
import documentRelationsRouter from './routes/documentRelationsRouter'

const app = express()

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error(`Origin ${origin} not allowed by CORS`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)

app.options('*', cors({
  origin: allowedOrigins,
  credentials: true,
}))

app.use(cookieParser())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use((req, _res, next) => {
  console.log(`[HTTP] ${req.method} ${req.originalUrl}`)
  next()
})

app.use('/api', authRouter)
app.use('/api', usersRouter)
app.use('/api', organizationsRouter)
app.use('/api', processesRouter)
app.use('/api', metadataRouter)
app.use('/api', workflowRouter)
app.use('/api', workflowsRouter)
app.use('/api', documentsRouter)
app.use('/api', tasksRouter)
app.use('/api', environmentRouter)
app.use('/api', notificationsRouter)
app.use('/api', dashboardRouter)
app.use('/api', documentRelationsRouter)


app.use((
  err: any,
  req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
) => {
  console.error('[GLOBAL ERROR]', req.method, req.originalUrl, err)
  res.status(500).json({
    message: 'Erro interno do servidor.',
    error: err?.message ?? 'unknown error',
  })
})

export default app