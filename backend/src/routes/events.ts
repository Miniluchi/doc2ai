import express from 'express';
import EventsController from '../controllers/eventsController.js';

const router = express.Router();
const eventsController = new EventsController();

router.get('/', eventsController.stream.bind(eventsController));

export default router;
