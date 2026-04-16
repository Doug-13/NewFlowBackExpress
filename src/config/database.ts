import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : false,
});

pool.connect()
  .then((client) => {
    console.log('Conectado ao PostgreSQL/Neon com sucesso!');
    client.release();
  })
  .catch((error: Error) => {
    console.error('Erro ao conectar no PostgreSQL/Neon:', error.message);
  });

pool.on('error', (error: Error) => {
  console.error('Erro na conexão com PostgreSQL:', error);
});

export default {
  query: (text: string, params?: any[]) => pool.query(text, params),
  pool,
};