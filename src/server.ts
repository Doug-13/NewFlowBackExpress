import dotenv from 'dotenv'
import app from './app'

dotenv.config()

const PORT = Number(process.env.PORT || 3000)

app.listen(PORT, () => {
  console.log(`Running on port ${PORT}!`)
})