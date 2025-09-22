import express from 'express'
import AuthController from '../controllers/authController.js'

const router = express.Router()
const authController = new AuthController()

// Routes pour l'authentification Google OAuth
router.get('/google', authController.getGoogleAuthUrl.bind(authController))
router.get('/google/callback', authController.googleCallback.bind(authController))

export default router
